# Navigator

AI copilot for Elsevier support agents on live calls. Returns the matching workflow, spoken script, CARE guidance, Oracle CIDAR fields and email templates from internal knowledge entries.

## Stack
React + Vite + Tailwind + motion, Python FastAPI, AWS Bedrock (Claude Sonnet 4.6) with Groq fallback, Groq Whisper for speech-to-text, pandas/openpyxl over local .xlsx files.

## Run
Backend: `pip install fastapi uvicorn python-multipart pandas openpyxl groq python-dotenv httpx boto3` then `uvicorn main:app --port 8000`
Frontend: `cd frontend`, `npm install`, `npm run dev`

Knowledge base .xlsx files and .env are not included in this repo.

## Declaration
This solution is a prototype created for hackathon purposes only. It is not approved for production use. All simulated elements, external dependencies, data sources, and known limitations have been disclosed.
