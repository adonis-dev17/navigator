import { useState, useEffect, useRef } from "react";
import {
  Mic,
  Copy,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Sparkles,
  BookOpen,
  Terminal,
  ChevronRight,
  Mail,
  MessageSquareText,
  RotateCcw,
  HeartHandshake,
  ShieldAlert,
  Compass,
  CheckCheck,
  ExternalLink,
  FileText,
  Clock,
  Bell,
  X,
} from "lucide-react";
import GlassCard from "./components/ui/glass-card";
import ToggleSwitch, {
  AnimatedLiquidGlass,
} from "./components/ui/toggle-switch";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function App() {
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Processing...");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [checkedSteps, setCheckedSteps] = useState({});
  const [isListening, setIsListening] = useState(false);
  const [copiedSection, setCopiedSection] = useState(null);

  const [activeTab, setActiveTab] = useState("speak");
  const [activeEmailTab, setActiveEmailTab] = useState("care");
  const [darkMode, setDarkMode] = useState(true);

  const [schedule, setSchedule] = useState(() => {
    const saved = localStorage.getItem("navigator_schedule");
    return saved
      ? JSON.parse(saved)
      : { break1: "08:30", lunch: "10:00", break2: "12:45" };
  });
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const [activeAlert, setActiveAlert] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const starters = [
    "Student access code says it was already redeemed",
    "Student redeemed the access code on the wrong account",
    "How do I request an Evolve manual refund?",
    "Evolve payment error when placing an order",
  ];

  useEffect(
    () => localStorage.setItem("navigator_schedule", JSON.stringify(schedule)),
    [schedule],
  );

  useEffect(() => {
    if (!isListening) {
      setRecordSecs(0);
      return;
    }
    const t = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isListening]);

  useEffect(() => {
    const checkSchedule = () => {
      const now = new Date();
      const currentMins = now.getHours() * 60 + now.getMinutes();
      const parseMins = (timeStr) => {
        if (!timeStr) return null;
        const [h, m] = timeStr.split(":").map(Number);
        return h * 60 + m;
      };

      const b1 = parseMins(schedule.break1);
      const l = parseMins(schedule.lunch);
      const b2 = parseMins(schedule.break2);

      let triggeredAlert = null;
      [
        { name: "1st Break", mins: b1, time: schedule.break1 },
        { name: "Lunch Break", mins: l, time: schedule.lunch },
        { name: "2nd Break", mins: b2, time: schedule.break2 },
      ].forEach((item) => {
        if (item.mins !== null) {
          const diff = item.mins - currentMins;
          if (diff >= 0 && diff <= 10)
            triggeredAlert = {
              type: item.name,
              minsLeft: diff,
              time: item.time,
            };
        }
      });
      setActiveAlert(triggeredAlert);
    };

    checkSchedule();
    const interval = setInterval(checkSchedule, 10000);
    return () => clearInterval(interval);
  }, [schedule]);

  useEffect(() => {
    let titleInterval;
    if (activeAlert) {
      let isBlink = false;
      titleInterval = setInterval(() => {
        document.title = isBlink
          ? `⏰ (${activeAlert.minsLeft}m) ${activeAlert.type.toUpperCase()} SOON!`
          : "🚨 AUX BREAK REMINDER";
        isBlink = !isBlink;
      }, 1000);
    } else {
      document.title = "NAVIGATOR - AI Call Center Copilot";
    }
    return () => {
      clearInterval(titleInterval);
      document.title = "NAVIGATOR - AI Call Center Copilot";
    };
  }, [activeAlert]);

  useEffect(() => {
    let interval;
    if (loading) {
      let step = 0;
      const steps = [
        "Analyzing customer intent...",
        "Scanning internal Knowledge Base...",
        "Applying C.A.R.E. framework...",
        "Generating Oracle CIDAR ticket notes...",
      ];
      setLoadingText(steps[0]);
      interval = setInterval(() => {
        step = (step + 1) % steps.length;
        setLoadingText(steps[step]);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const handleSearch = async (query = note) => {
    if (!query.trim()) return;
    setNote(query);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: query }),
      });
      const result = await res.json();
      if (!res.ok)
        throw new Error(result.detail || "Knowledge engine unavailable");
      setData(result);
      setCheckedSteps({});
      setActiveTab("speak");
      setActiveEmailTab("care");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleListen = async () => {
    if (isListening) {
      if (mediaRecorderRef.current) mediaRecorderRef.current.stop();
      setIsListening(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        setLoadingText("Transcribing smart audio...");
        setLoading(true);
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");

        try {
          const res = await fetch(`${API_URL}/api/transcribe`, {
            method: "POST",
            body: formData,
          });
          const result = await res.json();
          setNote(result.transcript);
        } catch (err) {
          setError("Transcription failed: " + err.message);
        } finally {
          setLoading(false);
        }
      };
      mediaRecorder.start();
      setIsListening(true);
    } catch (err) {
      setError("Microphone access denied or unavailable.");
    }
  };

  const copyToClipboard = (text, section) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const toggleCheck = (idx) =>
    setCheckedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));

  const handleReset = () => {
    setNote("");
    setData(null);
    setError(null);
    setCheckedSteps({});
    setActiveEmailTab("care");
  };

  const generateEmailDraft = () =>
    !data
      ? ""
      : `Dear Customer,\n\n${data.care?.awareness_empathy || ""}\n\n${data.care?.clarity || ""}\n\nActions Taken:\n${data.actions?.map((a) => `- ${a}`).join("\n")}\n\n${data.care?.empowerment || ""}\n\nReference: ${data.source?.startsWith("http") ? data.source : "Elsevier Support"}\n\nBest regards,\nElsevier Customer Care`;
  const generateSummaryEmail = () =>
    !data
      ? ""
      : `Dear Customer,\n\nThank you for contacting Elsevier Online Solutions.\n\nRegarding your concern: ${data.cidar?.concern || "your recent inquiry"}\n\nHere is a summary of how we assisted you today: ${data.cidar?.resolution || "We worked to resolve your issue."}\n\nPlease let me know if you have any additional questions.\n\nBest regards,\nElsevier Customer Care`;
  const generateScreenShareEmail = () =>
    `Hi [Customer Name],\n\nAs discussed on the phone, please click the "Click Me" link below to start our BeyondTrust screen share session so I can view your screen and assist you:\n\nClick Me >>> [INSERT LINK HERE]\n\nNext Steps:\n1. Click the link above.\n2. Follow the prompt to download and run the temporary BeyondTrust file.\n3. If your computer asks for permission, click Allow or Open.\n\nI am right here on the line with you, so please let me know as soon as the file begins downloading!\n\nBest regards,\nElsevier Customer Care`;
  const generateDisconnectedEmail = () =>
    `Dear [Customer Name],\n\nWe were just speaking on the phone and it appears our call was unexpectedly disconnected.\n\nI am still working on your request. If you still need assistance, please reply directly to this email or call us back at your earliest convenience so we can pick up right where we left off.\n\nBest regards,\nElsevier Customer Care`;
  const generateRefundEmail = () =>
    `Dear [Customer Name],\n\nThank you for contacting Elsevier Online Solutions regarding your request for a refund.\n\nPlease note that the refund request was submitted to the Refunds Team. Please allow 15 to 20 business days for the amount to be credited to your account.\n\nAs this request has been submitted to the Refunds Team, your access to the product has been removed.\n\nPlease let me know if you have any questions. Here is your refund request number: [Ticket Number].\n\nBest regards,\nElsevier Customer Care`;

  const getActiveEmailContent = () => {
    switch (activeEmailTab) {
      case "summary":
        return generateSummaryEmail();
      case "screenshare":
        return generateScreenShareEmail();
      case "disconnected":
        return generateDisconnectedEmail();
      case "refund":
        return generateRefundEmail();
      default:
        return generateEmailDraft();
    }
  };

  const generateFullCidar = () =>
    !data || !data.cidar
      ? ""
      : `[CONCERN]:\n${data.cidar.concern}\n\n[DETAILS]:\n${data.cidar.details}\n\n[ACTION]:\n${data.cidar.action}\n\n[RESOLUTION]:\n${data.cidar.resolution}`;
  const isComplete =
    data &&
    data.actions &&
    Object.values(checkedSteps).filter(Boolean).length === data.actions.length;

  return (
    <div
      className={`min-h-screen font-sans p-4 md:p-8 transition-colors duration-500 relative overflow-hidden ${darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-100 text-slate-800"}`}
    >
      {darkMode && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none opacity-50">
          <div
            className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-emerald-900/40 blur-[120px] mix-blend-screen animate-pulse"
            style={{ animationDuration: "8s" }}
          />
          <div
            className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-blue-900/40 blur-[150px] mix-blend-screen animate-pulse"
            style={{ animationDuration: "12s" }}
          />
        </div>
      )}

      <div className="max-w-6xl mx-auto flex flex-col space-y-6 relative z-10">
        {activeAlert && (
          <div className="bg-gradient-to-r from-rose-600 via-pink-600 to-amber-600 text-white p-4 rounded-2xl shadow-lg flex justify-between items-center animate-pulse border border-rose-400">
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                <Bell className="w-6 h-6 text-white animate-bounce" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm uppercase tracking-wider">
                  Upcoming Schedule Reminder
                </h3>
                <p className="text-xs font-medium text-rose-100">
                  Your{" "}
                  <span className="underline font-bold text-white">
                    {activeAlert.type}
                  </span>{" "}
                  is scheduled at{" "}
                  <span className="font-bold text-white">
                    {activeAlert.time}
                  </span>{" "}
                  (in {activeAlert.minsLeft} minutes). Wrap up your current case
                  to maintain adherence!
                </p>
              </div>
            </div>
            <button
              onClick={() => setActiveAlert(null)}
              className="bg-white/20 hover:bg-white/30 text-white p-1.5 rounded-lg text-xs font-semibold transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <GlassCard
          tint={
            darkMode
              ? "oklch(0.2 0.05 240 / 0.4)"
              : "oklch(0.98 0.01 240 / 0.6)"
          }
        >
          <div
            className={`flex flex-col md:flex-row justify-between items-center w-full gap-4 ${darkMode ? "text-white" : "text-slate-900"}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900/80 flex items-center justify-center shadow">
                <Terminal className="text-emerald-400 w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-tight">NAVIGATOR</h1>
                <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-500 font-bold">
                  C.A.R.E. AI Engine Active
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowScheduleModal(true)}
                className={`relative overflow-hidden flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl border transition shadow-[0_0_12px_rgba(16,185,129,0.3)] border-emerald-400/50 ${darkMode ? "bg-slate-800/50 text-emerald-100 hover:bg-slate-700/50" : "bg-white/50 text-emerald-900 hover:bg-emerald-50"}`}
              >
                <span className="absolute inset-0 rounded-xl bg-emerald-400/20 animate-pulse"></span>
                <Clock className="w-4 h-4 text-emerald-500 relative z-10" />
                <span className="hidden sm:inline relative z-10">
                  Schedule AUX
                </span>
              </button>

              <div className="flex items-center gap-2">
                <ToggleSwitch
                  size="sm"
                  isActive={!darkMode}
                  onChange={(active) => setDarkMode(!active)}
                  darkMode={darkMode}
                />
              </div>

              {data && (
                <button
                  onClick={handleReset}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-xl transition ${darkMode ? "bg-slate-800/50 hover:bg-slate-700/80 text-slate-200" : "bg-slate-100/50 hover:bg-slate-200/80 text-slate-700"}`}
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Start New Case
                </button>
              )}
            </div>
          </div>
        </GlassCard>

        {showScheduleModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <GlassCard
              className={`p-6 max-w-md w-full space-y-4 ${darkMode ? "text-white" : "text-slate-900"}`}
              tint={
                darkMode
                  ? "oklch(0.2 0.05 240 / 0.8)"
                  : "oklch(0.98 0.01 240 / 0.9)"
              }
            >
              <div className="flex justify-between items-center border-b pb-3 border-slate-500/30">
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-emerald-500" />
                  <h3 className="font-bold text-base">Verint AUX Schedule</h3>
                </div>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="text-slate-400 hover:text-emerald-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    1st Break
                  </label>
                  <input
                    type="time"
                    value={schedule.break1}
                    onChange={(e) =>
                      setSchedule({ ...schedule, break1: e.target.value })
                    }
                    className={`w-full text-sm p-2.5 rounded-xl border focus:outline-none focus:border-emerald-500 bg-transparent ${darkMode ? "border-slate-700 text-white" : "border-slate-300 text-slate-900"}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Lunch Break
                  </label>
                  <input
                    type="time"
                    value={schedule.lunch}
                    onChange={(e) =>
                      setSchedule({ ...schedule, lunch: e.target.value })
                    }
                    className={`w-full text-sm p-2.5 rounded-xl border focus:outline-none focus:border-emerald-500 bg-transparent ${darkMode ? "border-slate-700 text-white" : "border-slate-300 text-slate-900"}`}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    2nd Break
                  </label>
                  <input
                    type="time"
                    value={schedule.break2}
                    onChange={(e) =>
                      setSchedule({ ...schedule, break2: e.target.value })
                    }
                    className={`w-full text-sm p-2.5 rounded-xl border focus:outline-none focus:border-emerald-500 bg-transparent ${darkMode ? "border-slate-700 text-white" : "border-slate-300 text-slate-900"}`}
                  />
                </div>
              </div>
              <div className="pt-3 flex justify-end">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition shadow-sm"
                >
                  Save Schedule
                </button>
              </div>
            </GlassCard>
          </div>
        )}

        {!data ? (
          <GlassCard
            className={`max-w-3xl mx-auto w-full p-6 space-y-6 my-6 ${darkMode ? "text-white" : "text-slate-900"}`}
            tint={
              darkMode
                ? "oklch(0.2 0.05 240 / 0.4)"
                : "oklch(0.98 0.01 240 / 0.6)"
            }
          >
            <div>
              <h2 className="text-xl font-bold mb-1">
                Customer Inquiry Intake
              </h2>
              <p className="text-xs text-slate-400">
                Type or dictate requests to automatically generate workflows &
                CIDAR notes.
              </p>
            </div>
            <div
              className={`relative border rounded-xl p-3 transition ${darkMode ? "bg-slate-900/40 border-slate-700/50 focus-within:border-emerald-500" : "bg-white/40 border-slate-300 focus-within:border-emerald-500"}`}
            >
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (!loading && note.trim() && !isListening)
                      handleSearch(note);
                  }
                }}
                rows={3}
                placeholder="e.g. Student purchased an OOP title and needs assistance..."
                className="w-full bg-transparent text-sm focus:outline-none resize-none placeholder-slate-400"
              />
              <div
                className={`flex justify-between items-center pt-2 border-t ${darkMode ? "border-slate-700/50" : "border-slate-200"}`}
              >
                <button
                  onClick={toggleListen}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition ${isListening ? "bg-red-500 text-white border border-red-400" : darkMode ? "bg-slate-800/50 text-slate-300 hover:text-white border border-slate-700/50" : "bg-white text-slate-600 border border-slate-200"}`}
                >
                  {isListening ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse" />
                      Stop (
                      {String(Math.floor(recordSecs / 60)).padStart(2, "0")}:
                      {String(recordSecs % 60).padStart(2, "0")})
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4" /> Record
                    </>
                  )}
                </button>
                <button
                  onClick={() => handleSearch(note)}
                  disabled={loading || !note.trim() || isListening}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium text-sm px-5 py-2 rounded-lg transition shadow-sm min-w-[200px] justify-center"
                >
                  {loading ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />{" "}
                      {loadingText}
                    </>
                  ) : (
                    <>
                      <ChevronRight className="w-4 h-4" /> Generate Workflow
                    </>
                  )}
                </button>
              </div>
            </div>
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}
            <div
              className={`pt-2 border-t ${darkMode ? "border-slate-700/50" : "border-slate-200"}`}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
                Frequent Scenarios
              </p>
              <div className="flex flex-wrap gap-2">
                {starters.map((starter, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSearch(starter)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition shadow-sm ${darkMode ? "bg-slate-800/40 hover:bg-slate-700/60 border-slate-700/50 text-slate-300" : "bg-white/60 hover:bg-emerald-50 border-slate-200 hover:border-emerald-300 text-slate-700"}`}
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 space-y-6">
              <GlassCard
                className="p-4"
                refraction={0}
                tint={
                  darkMode
                    ? "oklch(0.18 0.02 240 / 0.5)"
                    : "oklch(0.98 0.01 240 / 0.6)"
                }
              >
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">
                  Customer inquiry
                </p>
                <p className="text-sm">{note}</p>
              </GlassCard>

              <GlassCard
                className={`p-6 ${darkMode ? "text-white" : "text-slate-900"}`}
                tint={
                  darkMode
                    ? "oklch(0.2 0.05 240 / 0.4)"
                    : "oklch(0.98 0.01 240 / 0.6)"
                }
              >
                <div
                  className={`flex gap-4 border-b pb-3 mb-4 overflow-x-auto ${darkMode ? "border-slate-700/50" : "border-slate-200"}`}
                >
                  <button
                    onClick={() => setActiveTab("speak")}
                    className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider pb-1 transition border-b-2 whitespace-nowrap ${activeTab === "speak" ? "border-emerald-500 text-emerald-500" : "border-transparent text-slate-400"}`}
                  >
                    <MessageSquareText className="w-4 h-4" /> Spoken Script
                  </button>
                  <button
                    onClick={() => setActiveTab("email")}
                    className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider pb-1 transition border-b-2 whitespace-nowrap ${activeTab === "email" ? "border-emerald-500 text-emerald-500" : "border-transparent text-slate-400"}`}
                  >
                    <Mail className="w-4 h-4" /> Email Templates
                  </button>
                  <button
                    onClick={() => setActiveTab("cidar")}
                    className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider pb-1 transition border-b-2 whitespace-nowrap ${activeTab === "cidar" ? "border-emerald-500 text-emerald-500" : "border-transparent text-slate-400"}`}
                  >
                    <FileText className="w-4 h-4" /> Oracle CIDAR
                  </button>
                </div>

                {activeTab === "speak" && (
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        Read to Caller
                      </p>
                      <button
                        onClick={() => copyToClipboard(data.ask, "speak")}
                        className="text-slate-400 hover:text-emerald-400"
                      >
                        {copiedSection === "speak" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <div className="space-y-3">
                      <div
                        className={`p-3 rounded-xl border ${darkMode ? "bg-emerald-500/10 border-emerald-500/30" : "bg-emerald-50 border-emerald-200"}`}
                      >
                        <p className="text-[10px] uppercase tracking-widest text-emerald-500 font-bold mb-1">
                          Open with
                        </p>
                        <p className="text-sm font-semibold">"{data.ask}"</p>
                      </div>
                      {data.script && (
                        <p
                          className={`text-base font-medium p-4 rounded-xl border whitespace-pre-line ${darkMode ? "bg-slate-800/40 border-slate-700/50 text-slate-100" : "bg-white/60 border-slate-200 text-slate-900"}`}
                        >
                          {data.script}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === "email" && (
                  <div>
                    <div className="flex flex-wrap gap-2 mb-4 border-b pb-3 border-slate-500/30">
                      {[
                        "care",
                        "summary",
                        "screenshare",
                        "disconnected",
                        "refund",
                      ].map((tab) => {
                        const isActive = activeEmailTab === tab;
                        return (
                          <button
                            key={tab}
                            onClick={() => setActiveEmailTab(tab)}
                            className={`relative px-4 py-2 text-xs font-bold rounded-xl transition-all duration-300 overflow-hidden border ${isActive ? "text-white border-transparent" : "text-slate-400 border-slate-600/30 hover:bg-slate-700/30"}`}
                          >
                            {isActive && (
                              <AnimatedLiquidGlass
                                isActive={true}
                                darkMode={darkMode}
                                isPressed={false}
                              />
                            )}
                            <span className="relative z-10 flex items-center justify-center h-full">
                              {tab === "care" && "Full C.A.R.E."}
                              {tab === "summary" && "Summary"}
                              {tab === "screenshare" && "Screen Share"}
                              {tab === "disconnected" && "Call Dropped"}
                              {tab === "refund" && "Refund Status"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        Copy & Send Email
                      </p>
                      <button
                        onClick={() =>
                          copyToClipboard(getActiveEmailContent(), "email")
                        }
                        className="text-slate-400 hover:text-emerald-400"
                      >
                        {copiedSection === "email" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <pre
                      className={`text-xs p-4 rounded-xl border whitespace-pre-wrap font-sans ${darkMode ? "bg-slate-800/40 border-slate-700/50 text-slate-200" : "bg-white/60 border-slate-200 text-slate-800"}`}
                    >
                      {getActiveEmailContent()}
                    </pre>
                  </div>
                )}

                {activeTab === "cidar" && data.cidar && (
                  <div className="space-y-4">
                    <div
                      className={`flex justify-between items-center p-3 rounded-xl border ${darkMode ? "bg-slate-800/40 border-slate-700/50" : "bg-white/60 border-slate-200"}`}
                    >
                      <span className="text-xs font-bold text-slate-300">
                        Copy Full CIDAR Summary
                      </span>
                      <button
                        onClick={() =>
                          copyToClipboard(generateFullCidar(), "cidar-full")
                        }
                        className="flex items-center gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition"
                      >
                        {copiedSection === "cidar-full" ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}{" "}
                        Copy All
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {Object.entries(data.cidar).map(([key, value]) => (
                        <div
                          key={key}
                          className={`p-3 border rounded-xl space-y-1 ${darkMode ? "bg-slate-800/40 border-slate-700/50" : "bg-white/60 border-slate-200"}`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold uppercase text-slate-400">
                              Oracle Field: {key}
                            </span>
                            <button
                              onClick={() =>
                                copyToClipboard(value, `cidar-${key}`)
                              }
                              className="text-slate-400 hover:text-emerald-500"
                            >
                              {copiedSection === `cidar-${key}` ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                          <p
                            className={`text-xs font-medium ${darkMode ? "text-slate-200" : "text-slate-800"}`}
                          >
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </GlassCard>

              {data.care && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <GlassCard
                    className="p-4 space-y-2"
                    tint={
                      darkMode
                        ? "oklch(0.25 0.08 240 / 0.5)"
                        : "oklch(0.98 0.01 240 / 0.6)"
                    }
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                      <Compass className="w-4 h-4" /> C – Clarity & Solutions
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${darkMode ? "text-slate-200" : "text-slate-700"}`}
                    >
                      {data.care.clarity}
                    </p>
                  </GlassCard>
                  <GlassCard
                    className="p-4 space-y-2"
                    tint={
                      darkMode
                        ? "oklch(0.25 0.08 240 / 0.5)"
                        : "oklch(0.98 0.01 240 / 0.6)"
                    }
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-rose-400 uppercase tracking-wider">
                      <HeartHandshake className="w-4 h-4" /> A – Awareness &
                      Empathy
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${darkMode ? "text-slate-200" : "text-slate-700"}`}
                    >
                      {data.care.awareness_empathy}
                    </p>
                  </GlassCard>
                  <GlassCard
                    className="p-4 space-y-2"
                    tint={
                      darkMode
                        ? "oklch(0.25 0.08 240 / 0.5)"
                        : "oklch(0.98 0.01 240 / 0.6)"
                    }
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-wider">
                      <ShieldAlert className="w-4 h-4" /> R – Reach Out &
                      Escalate
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${darkMode ? "text-slate-200" : "text-slate-700"}`}
                    >
                      {data.care.reach_out}
                    </p>
                  </GlassCard>
                  <GlassCard
                    className="p-4 space-y-2"
                    tint={
                      darkMode
                        ? "oklch(0.25 0.08 240 / 0.5)"
                        : "oklch(0.98 0.01 240 / 0.6)"
                    }
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                      <CheckCheck className="w-4 h-4" /> E – Empowerment &
                      Ownership
                    </div>
                    <p
                      className={`text-xs leading-relaxed ${darkMode ? "text-slate-200" : "text-slate-700"}`}
                    >
                      {data.care.empowerment}
                    </p>
                  </GlassCard>
                </div>
              )}

              {data.actions && data.actions.length > 0 && (
                <GlassCard
                  className={`p-6 ${darkMode ? "text-white" : "text-slate-900"}`}
                  tint={
                    darkMode
                      ? "oklch(0.2 0.05 240 / 0.4)"
                      : "oklch(0.98 0.01 240 / 0.6)"
                  }
                >
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider">
                      Required Action Checklist
                    </h3>
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-md border ${isComplete ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20"}`}
                    >
                      {Object.values(checkedSteps).filter(Boolean).length} /{" "}
                      {data.actions.length} Completed
                    </span>
                  </div>
                  <div className="space-y-2">
                    {data.actions.map((act, idx) => {
                      const isChecked = !!checkedSteps[idx];
                      return (
                        <div
                          key={idx}
                          onClick={() => toggleCheck(idx)}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${isChecked ? (darkMode ? "bg-emerald-900/20 border-emerald-500/30 text-emerald-100" : "bg-emerald-50 border-emerald-200 text-emerald-900") : darkMode ? "bg-slate-800/40 border-slate-700/50 text-slate-200 hover:border-slate-500" : "bg-white/60 border-slate-200 hover:border-slate-300 text-slate-800"}`}
                        >
                          {isChecked ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                          ) : (
                            <Circle className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                          )}
                          <span
                            className={`text-xs ${isChecked ? "line-through opacity-80" : ""}`}
                          >
                            {act}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </GlassCard>
              )}

              {data.other_issues?.length > 0 && (
                <GlassCard
                  className="p-5 space-y-3"
                  refraction={0}
                  tint={
                    darkMode
                      ? "oklch(0.18 0.02 240 / 0.5)"
                      : "oklch(0.98 0.01 240 / 0.6)"
                  }
                >
                  <h4 className="text-xs font-bold uppercase text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Also mentioned
                  </h4>
                  {data.other_issues.map((issue, i) => (
                    <button
                      key={i}
                      onClick={() => handleSearch(issue)}
                      className="w-full text-left text-xs p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition"
                    >
                      {issue} <span className="opacity-60">— handle next</span>
                    </button>
                  ))}
                </GlassCard>
              )}
            </div>

            <div className="lg:col-span-4 space-y-6">
              {data.warnings && data.warnings.length > 0 && (
                <GlassCard
                  className="p-5"
                  tint={
                    darkMode
                      ? "oklch(0.2 0.05 240 / 0.4)"
                      : "oklch(0.98 0.01 240 / 0.6)"
                  }
                >
                  <p
                    className={`text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2 ${darkMode ? "text-amber-400" : "text-amber-700"}`}
                  >
                    <AlertTriangle className="w-4 h-4" /> Hard Constraints
                  </p>
                  <div
                    className={`space-y-1 text-xs ${darkMode ? "text-amber-200" : "text-amber-800"}`}
                  >
                    {data.warnings.map((w, idx) => (
                      <p key={idx}>• {w}</p>
                    ))}
                  </div>
                </GlassCard>
              )}

              <GlassCard
                className="p-5"
                tint={
                  darkMode
                    ? "oklch(0.2 0.05 240 / 0.4)"
                    : "oklch(0.98 0.01 240 / 0.6)"
                }
              >
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                  Workflow Matched
                </span>
                <h2
                  className={`text-base font-bold mt-3 ${darkMode ? "text-white" : "text-slate-900"}`}
                >
                  {data.title}
                </h2>
              </GlassCard>
              {data.source?.startsWith("http") && (
                <GlassCard
                  className="p-6 space-y-4"
                  tint={
                    darkMode
                      ? "oklch(0.2 0.05 240 / 0.4)"
                      : "oklch(0.98 0.01 240 / 0.6)"
                  }
                >
                  <h4 className="text-xs font-bold uppercase text-slate-400 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-emerald-400" /> Knowledge
                    Base Link
                  </h4>
                  <div className="space-y-3 text-xs">
                    <div>
                      <p className="text-slate-400 mb-1">Source Article</p>
                      <p
                        className={`font-semibold ${darkMode ? "text-slate-200" : "text-slate-800"}`}
                      >
                        {data.source_title || data.title}
                      </p>
                    </div>
                    <a
                      href={data.source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-emerald-400 hover:underline flex items-center justify-between bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20 transition"
                    >
                      <span className="flex items-center gap-1.5">
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" /> Open
                        Article in ISH
                      </span>
                    </a>
                  </div>
                </GlassCard>
              )}

              {data.other_issues?.length > 0 && (
                <GlassCard
                  className="p-5 space-y-3"
                  refraction={0}
                  tint={
                    darkMode
                      ? "oklch(0.18 0.02 240 / 0.5)"
                      : "oklch(0.98 0.01 240 / 0.6)"
                  }
                >
                  <h4 className="text-xs font-bold uppercase text-amber-400 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Also mentioned
                  </h4>
                  {data.other_issues.map((issue, i) => (
                    <button
                      key={i}
                      onClick={() => handleSearch(issue)}
                      className="w-full text-left text-xs p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 transition"
                    >
                      {issue} <span className="opacity-60">— handle next</span>
                    </button>
                  ))}
                </GlassCard>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
