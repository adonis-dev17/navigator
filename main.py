import os
import re
import json
import math
import httpx
import boto3
import pandas as pd
from collections import Counter
from functools import lru_cache
from openpyxl import load_workbook
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Clients --------------------------------------------------------------
# Groq handles transcription always (Bedrock has no speech-to-text).
# Analysis uses Bedrock when configured, Groq otherwise.

GROQ_KEY = os.environ.get("GROQ_API_KEY", "").strip()
client = None

if GROQ_KEY:
    try:
        client = Groq(api_key=GROQ_KEY, http_client=httpx.Client(verify=False))
        print("Groq client ready")
    except Exception as e:
        print(f"Groq init failed: {e}")
else:
    print("WARNING: GROQ_API_KEY missing from .env")

BEDROCK_REGION = os.environ.get("AWS_REGION", "us-east-1")
BEDROCK_MODEL = os.environ.get("BEDROCK_MODEL_ID", "").strip()
bedrock = None

if (os.environ.get("AWS_ACCESS_KEY_ID") or os.environ.get("AWS_BEARER_TOKEN_BEDROCK")) and BEDROCK_MODEL:
    try:
        bedrock = boto3.client("bedrock-runtime", region_name=BEDROCK_REGION)
        print(f"Bedrock ready: {BEDROCK_MODEL} in {BEDROCK_REGION}")
    except Exception as e:
        print(f"Bedrock init failed: {e}")
else:
    print("Bedrock not configured - analysis will use Groq")


# --- Retrieval ------------------------------------------------------------

# "student", "instructor" and "faculty" are deliberately NOT stopwords.
# Who is asking changes which workflow applies.
STOPWORDS = {
    "the", "a", "an", "is", "are", "was", "to", "for", "of", "in", "on", "at",
    "it", "this", "that", "and", "or", "but", "with", "i", "my", "her", "his",
    "can", "cant", "get", "got", "how", "do", "does", "did", "they", "them",
    "says", "said", "have", "has", "need",
}


def stem(word):
    """Crude suffix stripping so 'requesting' matches 'request'."""
    for suffix in ("ing", "ed", "es", "s"):
        if len(word) > len(suffix) + 3 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def terms(text):
    found = re.findall(r"[a-z0-9]+", str(text).lower())
    return {stem(w) for w in found if w not in STOPWORDS and len(w) > 2}


def sheet_to_text(ws):
    lines = []
    for row in ws.iter_rows(values_only=True):
        cells = [str(c).strip() for c in row if c is not None and str(c).strip()]
        if cells:
            lines.append(" | ".join(cells))
    return "\n".join(lines)


@lru_cache(maxsize=1)
def load_kb():
    workflows, articles = [], []

    if os.path.exists("workflows.xlsx"):
        wb = load_workbook("workflows.xlsx", data_only=True)
        for name in wb.sheetnames:
            if name.strip().lower() == "summary":
                continue
            body = sheet_to_text(wb[name])
            if body:
                workflows.append({
                    "kind": "workflow",
                    "title": name,
                    "body": body,
                    "source": "",
                    "internal": True,
                    "terms": terms(name + " " + body[:400]),
                })
        print(f"Loaded {len(workflows)} workflows")

    for path, internal in [("kb_internal.xlsx", True), ("kb_external.xlsx", False)]:
        if not os.path.exists(path):
            print(f"Missing file: {path}")
            continue
        df = pd.read_excel(path).fillna("")
        body_col = "Site_Text" if "Site_Text" in df.columns else "Content"
        for _, r in df.iterrows():
            articles.append({
                "kind": "article",
                "title": str(r.get("Query", "")),
                "body": str(r.get(body_col, "")),
                "source": str(r.get("Source", "")),
                "internal": internal,
                "terms": terms(f"{r.get('Query','')} {r.get('Product_Name','')}"),
            })

    rows = workflows + articles
    print(f"Loaded {len(rows)} total entries")
    return rows


@lru_cache(maxsize=1)
def term_weights():
    """Rare words carry more signal than common ones."""
    counts = Counter()
    rows = load_kb()
    for row in rows:
        for t in row["terms"]:
            counts[t] += 1
    total = len(rows)
    return {t: math.log(total / (1 + c)) for t, c in counts.items()}


def retrieve(query, limit=5):
    """Returns (context, internal, best_entry, reference)."""
    q = terms(query)
    if not q:
        return "", False, None, None

    weights = term_weights()
    q_weight = sum(weights.get(t, 1.0) for t in q) or 1.0

    scored = []
    for row in load_kb():
        overlap = q & row["terms"]
        if not overlap:
            continue
        score = sum(weights.get(t, 1.0) for t in overlap) / q_weight
        # Penalise long entries. A 12-word title has more chances to match
        # than a 6-word one, but the short focused title is the better answer.
        score /= (1 + math.log(1 + len(row["terms"]))) / 2.2
        if row["kind"] == "workflow":
            score *= 1.15
        scored.append((score, row))

    scored.sort(key=lambda x: -x[0])
    if not scored:
        return "", False, None, None

    top = scored[:limit]
    best = top[0][1]
    top_score = top[0][0]

    # Workflows outrank articles and can fill every slot, leaving no citable
    # article. Reserve a place for the best one, but only if genuinely
    # relevant. A weak citation is worse than none.
    reference = next(
        (row for score, row in scored
         if row["kind"] == "article"
         and row["source"].startswith("http")
         and score >= top_score * 0.5),
        None,
    )
    if reference and not any(r is reference for _, r in top):
        top = top[:limit - 1] + [(top_score * 0.5, reference)]

    internal = any(r["internal"] for _, r in top)

    context = "\n\n".join(
        f"[{r['kind'].upper()}] {r['title']}\n{r['body']}"
        + (f"\nLink: {r['source']}" if r["source"].startswith("http") else "")
        for _, r in top
    )
    return context, internal, best, reference


# --- Prompts --------------------------------------------------------------

SPLIT_PROMPT = """Split this customer support inquiry into its distinct issues.

Return ONLY valid JSON: {"issues": ["first issue", "second issue"]}

Each issue should be a short phrase a support rep could search on.
Keep any mention of who is asking (student, instructor, faculty) in each
issue, because it changes which workflow applies.
If the inquiry is a single issue, return one item. Maximum three items.
"""

SYSTEM_PROMPT = """
You are Navigator, an AI copilot for Elsevier support agents on live calls.

Use ONLY the context provided. Entries marked [WORKFLOW] are authoritative
step-by-step procedures — prefer them over [ARTICLE] entries. Never invent
steps, policies, timeframes, links, or email addresses.

Pay attention to who is asking. Student, instructor and faculty workflows
differ. If the context only covers a different audience than the inquiry,
say so in "warnings" rather than applying the wrong procedure.

"source" must be a URL copied exactly from a "Link:" line in the context.
If no Link line appears, set "source" to an empty string. Never guess a URL.

"ask" is a short opener the agent reads first — under 25 words, one question
or statement. "script" is the full spoken script with all necessary detail.

If the workflow branches on the caller's answer, list the options in
"branches" (2-3 short options). Otherwise use an empty list.

Respond STRICTLY in valid JSON, with no markdown fences:
{
  "title": "Short workflow title",
  "internal": false,
  "ask": "Short opener to read first. Under 25 words.",
  "script": "The full spoken script, with all required detail.",
  "branches": ["Short option", "Short option"],
  "actions": ["Action under 15 words", "Another"],
  "warnings": ["Hard constraint or escalation rule"],
  "care": {
    "awareness_empathy": "One sentence.",
    "clarity": "One or two sentences.",
    "reach_out": "Who to escalate to if steps fail.",
    "empowerment": "One sentence."
  },
  "cidar": {
    "concern": "Summary of the problem.",
    "details": "Products, codes, specifics.",
    "action": "Steps taken or guided.",
    "resolution": "Outcome or next steps."
  },
  "source": "URL from a Link line in the context, or empty string"
}
"""

NO_MATCH = {
    "title": "No matching article",
    "internal": True,
    "ask": "I don't have a documented workflow for this. Let me check with a colleague.",
    "script": "",
    "branches": [], "actions": [], "warnings": [],
    "care": None, "cidar": None,
    "source": "", "source_title": "", "other_issues": [],
}


def error_payload(msg):
    return {**NO_MATCH, "title": "System error",
            "ask": "Something went wrong on my side.",
            "warnings": [msg[:180]]}


def ask_model(system, user, temperature=0.2):
    """Groq call. Used for issue splitting and as the analysis fallback."""
    completion = client.chat.completions.create(
        model="openai/gpt-oss-120b",
        response_format={"type": "json_object"},
        temperature=temperature,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    )
    return json.loads(completion.choices[0].message.content)


def ask_bedrock(system, user, temperature=0.2):
    """Bedrock has no JSON mode. Some models add a preamble or split the
    reply across blocks, so join everything and keep only the outermost
    braces."""
    resp = bedrock.converse(
        modelId=BEDROCK_MODEL,
        system=[{"text": system}],
        messages=[{"role": "user", "content": [{"text": user}]}],
        inferenceConfig={"temperature": temperature, "maxTokens": 2000},
    )
    blocks = resp["output"]["message"]["content"]
    raw = "".join(b.get("text", "") for b in blocks).strip()
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end != -1:
        raw = raw[start:end + 1]
    return json.loads(raw)


# --- Analysis: Bedrock when available, Groq as fallback -------------------

def generate_analysis(context, note):
    user_msg = f"CONTEXT:\n{context}\n\nCUSTOMER INQUIRY:\n\"{note}\""
    if bedrock:
        try:
            return ask_bedrock(SYSTEM_PROMPT, user_msg)
        except Exception as e:
            print(f"[BEDROCK FAILED] {e} - falling back to Groq")
            if not client:
                raise
    return ask_model(SYSTEM_PROMPT, user_msg)


def split_issues(note):
    """Returns a list of distinct issues. Falls back to the whole note."""
    try:
        result = None
        if bedrock:
            try:
                result = ask_bedrock(SPLIT_PROMPT, note, temperature=0)
            except Exception as e:
                print(f"[BEDROCK SPLIT FAILED] {e}")
        if result is None:
            result = ask_model(SPLIT_PROMPT, note, temperature=0)
        issues = [str(i).strip() for i in result.get("issues", []) if str(i).strip()]
        return issues[:3] if issues else [note]
    except Exception as e:
        print(f"[SPLIT FAILED] {e}")
        return [note]


# --- Routes ---------------------------------------------------------------

class NoteRequest(BaseModel):
    note: str


@app.get("/api/health")
async def health():
    return {
        "groq": client is not None,
        "bedrock": bedrock is not None,
        "engine": "bedrock" if bedrock else "groq",
        "entries": len(load_kb()),
    }


@app.post("/api/analyze")
async def analyze_note(request: NoteRequest):
    note = request.note
    print(f"\n[QUERY] {note}")
    if not client and not bedrock:
        return error_payload("No AI client configured. Check .env")

    try:
        issues = split_issues(note)
        print(f"[ISSUES] {issues}")

        ranked = []
        for issue in issues:
            ctx, internal, best, ref = retrieve(issue)
            ranked.append((1 if ctx else 0, issue, ctx, internal, best, ref))
        ranked.sort(key=lambda x: -x[0])

        _, primary, context, internal, best, reference = ranked[0]

        if not context.strip():
            print("[NO MATCH] skipped model call")
            return {**NO_MATCH, "other_issues": issues[1:] if len(issues) > 1 else []}

        print(f"[TOP MATCH] {best['kind']}: {best['title']}")
        data = generate_analysis(context[:15000], primary)

        data["internal"] = internal
        data["other_issues"] = [i for i in issues if i != primary]

        # Only ever return a URL that came from retrieval.
        src = str(data.get("source", "")).strip()
        valid = {r["source"] for r in load_kb() if r["source"].startswith("http")}

        if src in valid:
            title = next((r["title"] for r in load_kb() if r["source"] == src), "")
        elif best["source"].startswith("http"):
            src, title = best["source"], best["title"]
        elif reference:
            src, title = reference["source"], reference["title"]
        else:
            src, title = "", ""

        data["source"] = src
        data["source_title"] = title

        print(f"[OK] {data.get('title')} | ref: {title or 'none'}")
        return data

    except Exception as e:
        print(f"[ERROR] {e}")
        return error_payload(str(e))


@app.post("/api/transcribe")
async def transcribe_audio(audio: UploadFile = File(...)):
    """Always Groq — Bedrock has no speech-to-text model."""
    if not client:
        return {"transcript": "Error: Groq client not initialised."}
    try:
        filename = audio.filename or "recording.webm"
        if "." not in filename:
            filename += ".webm"
        response = client.audio.transcriptions.create(
            file=(filename, await audio.read()),
            model="whisper-large-v3-turbo",
            prompt="Elsevier support call. Terms: Evolve, EAQ, HESI, Shadow "
                   "Health, Sherpath, access code, supercode, ISBN, OOP, "
                   "eBook, VST, LMS, VitalSource, OSvC, 1LS, 2LS.",
        )
        text = response.text.strip()
        print(f"[TRANSCRIPT] {text}")
        return {"transcript": text}
    except Exception as e:
        print(f"[TRANSCRIBE ERROR] {e}")
        return {"transcript": f"Error: {e}"}
