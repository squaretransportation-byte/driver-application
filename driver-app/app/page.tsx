"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic, MicOff, MessageCircle, X, Upload, Check, ChevronRight, ChevronLeft,
  FileText, Truck, Shield, User, Briefcase, Pill, FilePlus, PenTool,
  ClipboardCheck, Send, Sparkles, Loader2, AlertCircle, Plus, Trash2,
  Download, Phone, Mail, MapPin, Settings, Camera, Volume2, FolderOpen
} from "lucide-react";
import { compressAllFiles, calcTotalSizeMB } from "@/lib/image-compress";

const BRAND = {
  maroon: "#6B1A1A", maroonLight: "#8B2A2A",
  navy: "#0F1B2D", navyLight: "#1A2A42",
  gold: "#B8924A", goldLight: "#D4AF6A",
  cream: "#F5EFE6", steel: "#2A3441", ink: "#0A0F1A"
};

const blankEmployer = () => ({
  name: "", supervisor: "", startDate: "", endDate: "", phone: "",
  contactOk: "", address: "", city: "", state: "", zip: "",
  position: "", salary: "", reasonLeaving: "", dotTested: "", fmcsaSubject: ""
});
const blankAccident = () => ({ date: "", nature: "", fatalities: "", injuries: "", spill: "" });
const blankConviction = () => ({ date: "", violation: "", state: "", penalty: "" });
const blankResidence = () => ({ street: "", city: "", state: "", zip: "", years: "" });
const blankPriorLicense = () => ({ state: "", number: "", classType: "", endorsements: "", expiration: "" });
const blankExperience = () => ({ equipment: "", from: "", to: "", miles: "" });

const DEFAULT_FORM: any = {
  firstName: "", middleName: "", lastName: "",
  dob: "", ssn: "", email: "", phone: "",
  position: "", dateAvailable: "", legalRight: "",
  residences: [blankResidence(), blankResidence()],
  licenseState: "", licenseNumber: "", licenseClass: "",
  licenseEndorsements: "", licenseExpiration: "",
  priorLicenses: [blankPriorLicense()],
  experience: [blankExperience()],
  noAccidents: false, accidents: [blankAccident()],
  noConvictions: false, convictions: [blankConviction()],
  everDeniedLicense: "", everSuspended: "", everConvictedCMV: "", everConvictedLaw: "",
  complianceExplain: "",
  education: { hs: "", college: "", other: "" },
  employers: [blankEmployer()],
  daRefused: "", daPositive: "", daPreEmpPositive: "", daExplain: "",
  medCardExpiration: "",
  bankName: "", bankCity: "", bankState: "", bankZip: "",
  routingNumber: "", accountNumber: "", accountType: "checking",
  authMVR: false, authPSP: false, authClearinghouse: false,
  authDA: false, authFCRA: false, authHandbook: false,
  authDLCert: false, authOtherWork: false,
  otherEmployer: "", otherEmployerIntent: "",
  hosTotal: "", hosLastRelieved: ""
};

const STORAGE_KEY = "sts:onboarding:v1";
function saveProgress(data: any) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e){} }
function loadProgress() { try { const v = localStorage.getItem(STORAGE_KEY); return v ? JSON.parse(v) : null; } catch(e) { return null; } }

// Text-to-speech: makes the AI read questions aloud like a real interview.
// Uses browser SpeechSynthesis (free, no API call needed).
function useTextToSpeech() {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);
  const [voiceName, setVoiceName] = useState<string>("");
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const allMaleVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Add a debug entry visible on screen (so user doesn't need to open DevTools)
  const dlog = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString();
    console.log(`[TTS ${t}] ${msg}`);
    setDebugLog(prev => [...prev.slice(-9), `${t} ${msg}`]); // keep last 10
  }, []);

  // Names that strongly indicate a FEMALE voice — these are explicitly rejected
  const FEMALE_PATTERN = /\b(Zira|Eva|Hazel|Susan|Tessa|Catherine|Vicki|Vicky|Anna|Karen|Samantha|Aria|Jenny|Michelle|Ava|Emma|Sonia|Salli|Joanna|Kendra|Kimberly|Olivia|Ivy|Paulina|Nora|Nuala|Heather|Allison|Linda|Lisa|Female)\b/i;
  // Names that indicate a MALE voice — searched in priority order
  const MALE_PATTERN = /\b(Guy|David|Mark|Eric|Andrew|Christopher|Roger|Steffan|Brandon|Davis|Tony|Daniel|Alex|Fred|Tom|Aaron|Bruce|Ralph|Albert|Arthur|James|Jason|Justin|Liam|Matthew|Oliver|Brian|Joey|Male)\b/i;

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    setSupported(true);
    const saved = localStorage.getItem("sts:tts:enabled");
    if (saved === "false") setEnabled(false);
    const savedVoiceName = localStorage.getItem("sts:tts:voice");

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return;

      const enVoices = voices.filter(v => v.lang.startsWith("en"));
      // CRITICAL: Filter to OFFLINE voices only. The "Online (Natural)" voices
      // sound nicer but are unreliable for consecutive utterances after
      // SpeechRecognition runs — they go silent on Q2+. Local voices are robotic
      // but actually work consistently.
      const offlineVoices = enVoices.filter(v => v.localService);

      // Male offline voices (preferred)
      const maleVoices = offlineVoices.filter(v => MALE_PATTERN.test(v.name) && !FEMALE_PATTERN.test(v.name));

      // Any offline voice that isn't explicitly female (fallback)
      const safeFallback = offlineVoices.filter(v => !FEMALE_PATTERN.test(v.name) && !maleVoices.includes(v));

      const all = [...maleVoices, ...safeFallback];
      allMaleVoicesRef.current = all;

      // If user previously chose a voice and it's still available, use it
      if (savedVoiceName) {
        const saved = all.find(v => v.name === savedVoiceName);
        if (saved) {
          voiceRef.current = saved;
          setVoiceName(saved.name);
          return;
        }
      }

      // Last-resort fallback: any en-US local voice, even if female
      const chosen = all[0] || offlineVoices[0] || voices.find(v => v.lang === "en-US") || voices[0];
      voiceRef.current = chosen || null;
      setVoiceName(chosen?.name || "");
    };
    pickVoice();
    window.speechSynthesis.onvoiceschanged = pickVoice;

    // Chrome bug workaround: speechSynthesis pauses after recognition + idle
    const keepAlive = setInterval(() => {
      try {
        if (window.speechSynthesis && !window.speechSynthesis.speaking) {
          window.speechSynthesis.resume();
        }
      } catch (_) { /* noop */ }
    }, 4000);

    return () => {
      clearInterval(keepAlive);
      window.speechSynthesis.cancel();
    };
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!enabled || !text) {
      dlog(`skip: ${!enabled ? "disabled" : "empty text"}`);
      onEnd?.();
      return;
    }
    if (!supported) {
      dlog("skip: synth unsupported");
      onEnd?.();
      return;
    }

    if (audioRef.current) {
      try { audioRef.current.pause(); } catch (_) {}
      audioRef.current = null;
    }

    let endCalled = false;
    const safeEnd = (reason: string) => {
      if (endCalled) return;
      endCalled = true;
      dlog(`end: ${reason}`);
      setSpeaking(false);
      onEnd?.();
    };

    const fireSpeak = () => {
      try {
        // ── WAKEUP HACK ──
        // Chrome's speechSynthesis often goes mute after SpeechRecognition runs.
        // The proven workaround: speak a near-silent dummy utterance FIRST to
        // "wake up" the synth, then immediately queue the real utterance. The
        // synth processes them in order, the dummy is inaudible, and the real
        // one plays. This is the same trick Google's own demos use.
        const dummy = new SpeechSynthesisUtterance(" ");
        dummy.volume = 0;
        dummy.rate = 10;
        if (voiceRef.current) dummy.voice = voiceRef.current;

        const utt = new SpeechSynthesisUtterance(text);
        if (voiceRef.current) utt.voice = voiceRef.current;
        utt.rate = 0.95;
        utt.pitch = 0.95;
        utt.volume = 1.0;
        utt.onstart = () => {
          dlog("onstart ✓");
          setSpeaking(true);
        };
        utt.onend = () => safeEnd("onend");
        utt.onerror = (e: any) => safeEnd(`onerror: ${e?.error || "?"}`);

        window.speechSynthesis.resume();
        window.speechSynthesis.speak(dummy);   // wake up
        window.speechSynthesis.speak(utt);     // real
        dlog(`queued: "${text.slice(0, 40)}..." voice=${voiceRef.current?.name?.slice(0, 20) || "?"}`);

        // Failsafe — if onstart never fires within 5s, recover and continue
        setTimeout(() => {
          if (!endCalled && !window.speechSynthesis.speaking) {
            dlog("FAILSAFE: onstart never fired");
            try { window.speechSynthesis.cancel(); } catch (_) {}
            safeEnd("failsafe");
          }
        }, 5000);
      } catch (e: any) {
        dlog(`exception: ${e?.message || e}`);
        safeEnd("exception");
      }
    };

    const isBusy = window.speechSynthesis.speaking || window.speechSynthesis.pending;
    if (isBusy) {
      dlog("synth busy, cancel + 250ms");
      try { window.speechSynthesis.cancel(); } catch (_) {}
      setTimeout(fireSpeak, 250);
    } else {
      fireSpeak();
    }
  }, [supported, enabled, dlog]);

  // Cycle to the next available male voice (or any non-female fallback)
  const cycleVoice = useCallback(() => {
    const list = allMaleVoicesRef.current;
    if (!list.length) return null;
    const currentName = voiceRef.current?.name;
    const currentIdx = list.findIndex(v => v.name === currentName);
    const nextIdx = (currentIdx + 1) % list.length;
    const next = list[nextIdx];
    voiceRef.current = next;
    setVoiceName(next.name);
    try { localStorage.setItem("sts:tts:voice", next.name); } catch (_) {}
    return next;
  }, []);

  const stop = useCallback(() => {
    // Stop server-TTS audio (ElevenLabs MP3 playback)
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.currentTime = 0; } catch (_) {}
      audioRef.current = null;
    }
    // Stop browser TTS
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (_) {}
    }
    setSpeaking(false);
  }, []);

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem("sts:tts:enabled", String(next)); } catch (_) {}
      if (!next) {
        // Muting — stop both server-TTS audio and browser TTS
        if (audioRef.current) {
          try { audioRef.current.pause(); } catch (_) {}
          audioRef.current = null;
        }
        if (typeof window !== "undefined" && window.speechSynthesis) {
          try { window.speechSynthesis.cancel(); } catch (_) {}
        }
        setSpeaking(false);
      }
      return next;
    });
  }, []);

  return { speak, stop, speaking, supported, enabled, toggle, cycleVoice, voiceName, debugLog };
}

function useSpeech(onResult: (r: { final: string; interim: string; full: string }) => void) {
  const recRef = useRef<any>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    let finalText = "";
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t + " ";
        else interim += t;
      }
      onResult({ final: finalText, interim, full: finalText + interim });
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recRef.current = r;
    return () => { try { r.stop(); } catch(_){} };
  }, []);

  const start = useCallback(() => {
    if (!recRef.current) return;
    try { recRef.current.start(); setListening(true); } catch(_){}
  }, []);
  const stop = useCallback(() => {
    if (!recRef.current) return;
    try { recRef.current.stop(); } catch(_){}
    setListening(false);
  }, []);
  return { listening, supported, start, stop };
}

// Calls our serverless API route — API key never leaves the server
async function askClaude(messages: any[], system = "", model = "claude-haiku-4-5-20251001") {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, system, model }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data.text || "";
}

function Field({ label, required, children, hint }: any) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold tracking-[0.18em] uppercase mb-1.5"
            style={{ color: BRAND.gold }}>
        {label} {required && <span style={{ color: BRAND.maroonLight }}>*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] mt-1 italic" style={{ color: "#8896A8" }}>{hint}</span>}
    </label>
  );
}

function VoiceInput({ value, onChange, placeholder, type = "text", multiline = false }: any) {
  const baseRef = useRef(value || "");
  useEffect(() => { baseRef.current = value || ""; }, [value]);
  const speech = useSpeech(({ full }) => {
    onChange((baseRef.current ? baseRef.current + " " : "") + full.trim());
  });

  const handleClick = () => { if (speech.listening) speech.stop(); else speech.start(); };
  const baseClass = "w-full px-3 py-2.5 pr-10 text-sm rounded-md border outline-none transition-all";
  const style = {
    background: "rgba(255,255,255,0.04)",
    borderColor: speech.listening ? BRAND.gold : "rgba(184,146,74,0.25)",
    color: BRAND.cream,
    boxShadow: speech.listening ? `0 0 0 2px ${BRAND.gold}40` : "none"
  };

  return (
    <div className="relative">
      {multiline ? (
        <textarea value={value || ""} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} rows={3} className={baseClass} style={style} />
      ) : (
        <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} className={baseClass} style={style} />
      )}
      {speech.supported && (
        <button type="button" onClick={handleClick}
          className="absolute right-2 top-2.5 p-1.5 rounded transition-all"
          style={{
            background: speech.listening ? BRAND.maroon : "transparent",
            color: speech.listening ? BRAND.cream : BRAND.gold
          }}>
          {speech.listening ? <MicOff size={14} /> : <Mic size={14} />}
        </button>
      )}
    </div>
  );
}

function Select({ value, onChange, options, placeholder }: any) {
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 text-sm rounded-md border outline-none"
      style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(184,146,74,0.25)", color: BRAND.cream }}>
      <option value="" style={{ color: "#000" }}>{placeholder || "Select..."}</option>
      {options.map((o: any) => (
        <option key={o.value || o} value={o.value || o} style={{ color: "#000" }}>{o.label || o}</option>
      ))}
    </select>
  );
}

function YesNo({ value, onChange }: any) {
  return (
    <div className="flex gap-2">
      {["Yes", "No"].map(v => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className="flex-1 py-2 text-sm font-semibold tracking-wide rounded-md border transition-all"
          style={{
            background: value === v ? BRAND.maroon : "transparent",
            borderColor: value === v ? BRAND.maroon : "rgba(184,146,74,0.3)",
            color: value === v ? BRAND.cream : BRAND.gold
          }}>{v}</button>
      ))}
    </div>
  );
}

function Checkbox({ checked, onChange, label }: any) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <span className="flex-shrink-0 w-5 h-5 mt-0.5 rounded border-2 flex items-center justify-center transition-all"
        style={{ background: checked ? BRAND.gold : "transparent", borderColor: checked ? BRAND.gold : "rgba(184,146,74,0.5)" }}
        onClick={() => onChange(!checked)}>
        {checked && <Check size={14} style={{ color: BRAND.navy }} strokeWidth={3} />}
      </span>
      <span className="text-sm leading-relaxed" style={{ color: BRAND.cream }}>{label}</span>
    </label>
  );
}

function SignaturePad({ onChange, value }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = BRAND.cream;
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0);
      img.src = value;
    }
  }, []);

  const pos = (e: any) => {
    const r = canvasRef.current!.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const start = (e: any) => { e.preventDefault(); drawing.current = true; last.current = pos(e); };
  const move = (e: any) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const end = () => { if (!drawing.current) return; drawing.current = false; onChange(canvasRef.current!.toDataURL()); };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    onChange("");
  };

  return (
    <div>
      <canvas ref={canvasRef} width={500} height={140}
        className="w-full rounded-md border-2 cursor-crosshair touch-none"
        style={{ background: "rgba(0,0,0,0.3)", borderColor: BRAND.gold + "60" }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <button type="button" onClick={clear}
        className="mt-2 text-xs uppercase tracking-widest px-3 py-1 border rounded"
        style={{ color: BRAND.gold, borderColor: BRAND.gold + "50" }}>Clear signature</button>
    </div>
  );
}

function UploadZone({ id, label, hint, file, onFile, required, accept }: any) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (f: File | null | undefined) => {
    if (!f) return;
    setError(null);
    setBusy(true);
    try {
      // Read into data URL
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(f);
      });
      let payload: any = { name: f.name, size: f.size, type: f.type, dataUrl };
      // Compress images on the fly so phone photos don't blow up payloads
      if (f.type.startsWith("image/") && typeof window !== "undefined") {
        try {
          const mod = await import("../lib/image-compress");
          payload = await mod.compressImageIfPossible(payload);
        } catch (_) { /* compression optional */ }
      }
      // Soft warning for very small images (likely blurry / accidental)
      if (f.type.startsWith("image/") && payload.size < 30_000) {
        setError("Image looks very small — make sure it's clear and readable.");
      }
      // Hard cap at ~4 MB after compression
      if (payload.size > 4 * 1024 * 1024) {
        setError("File is too large (max 4 MB). Try a clearer but smaller photo.");
        setBusy(false);
        return;
      }
      onFile(payload);
    } catch (e: any) {
      setError(e.message || "Upload failed");
    }
    setBusy(false);
  };

  const isImage = file && (file.type || "").startsWith("image/");
  const isPdf = file && (file.type || "").includes("pdf");

  return (
    <div className="relative p-3 rounded-lg transition-all"
      style={{
        border: `2px ${file ? "solid" : "dashed"} ${file ? BRAND.gold : "rgba(184,146,74,0.35)"}`,
        background: file ? "rgba(184,146,74,0.06)" : "rgba(255,255,255,0.02)",
      }}>
      <input ref={fileInputRef} type="file" accept={accept || "image/*,application/pdf"} className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])} />
      {/* capture="environment" hints mobile to open the back camera directly */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])} />

      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-sm font-bold" style={{ color: BRAND.cream, fontFamily: "Oswald, sans-serif", letterSpacing: "0.05em" }}>
              {label}
            </div>
            {required && !file && (
              <span className="px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest font-bold"
                style={{ background: BRAND.maroon, color: BRAND.cream }}>Required</span>
            )}
            {file && (
              <span className="px-1.5 py-0.5 rounded text-[8px] uppercase tracking-widest font-bold"
                style={{ background: BRAND.gold, color: BRAND.navy }}>Uploaded</span>
            )}
          </div>
          {!file && hint && (
            <div className="text-[11px] mt-0.5" style={{ color: "#8896A8" }}>{hint}</div>
          )}
        </div>
        {file && (
          <button type="button" onClick={() => onFile(null)} className="p-1 flex-shrink-0">
            <Trash2 size={14} style={{ color: BRAND.maroonLight }} />
          </button>
        )}
      </div>

      {/* Preview */}
      {file && (
        <div className="mb-2">
          {isImage ? (
            <div className="relative rounded overflow-hidden" style={{ background: "#000", maxHeight: 180 }}>
              <img src={file.dataUrl} alt={label}
                className="w-full h-auto object-contain"
                style={{ maxHeight: 180, display: "block", margin: "0 auto" }} />
            </div>
          ) : isPdf ? (
            <div className="flex items-center gap-2 px-2 py-3 rounded" style={{ background: "rgba(0,0,0,0.3)" }}>
              <FileText size={20} style={{ color: BRAND.gold }} />
              <div className="text-xs truncate" style={{ color: BRAND.cream }}>{file.name}</div>
            </div>
          ) : null}
          <div className="text-[10px] mt-1 text-right" style={{ color: BRAND.gold }}>
            {(file.size / 1024).toFixed(0)} KB · {file.name}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!file && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy}
            onClick={() => cameraInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded text-[11px] uppercase tracking-widest font-bold disabled:opacity-50"
            style={{ background: BRAND.maroon, color: BRAND.cream }}>
            <Camera size={14} /> Take Photo
          </button>
          <button type="button" disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 py-2.5 rounded text-[11px] uppercase tracking-widest font-bold disabled:opacity-50"
            style={{ background: "transparent", color: BRAND.gold, border: `1px solid ${BRAND.gold}50` }}>
            <FolderOpen size={14} /> Upload File
          </button>
        </div>
      )}
      {file && (
        <div className="flex gap-2">
          <button type="button" onClick={() => cameraInputRef.current?.click()}
            className="flex-1 py-2 rounded text-[10px] uppercase tracking-widest font-bold flex items-center justify-center gap-1.5"
            style={{ background: "transparent", color: BRAND.gold, border: `1px solid ${BRAND.gold}40` }}>
            <Camera size={12} /> Re-take
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()}
            className="flex-1 py-2 rounded text-[10px] uppercase tracking-widest font-bold flex items-center justify-center gap-1.5"
            style={{ background: "transparent", color: BRAND.gold, border: `1px solid ${BRAND.gold}40` }}>
            <FolderOpen size={12} /> Replace
          </button>
        </div>
      )}

      {busy && (
        <div className="mt-2 text-[11px] text-center" style={{ color: BRAND.gold }}>
          Processing...
        </div>
      )}
      {error && (
        <div className="mt-2 px-2 py-1.5 rounded text-[11px] flex items-start gap-1.5"
          style={{ background: BRAND.maroon + "30", color: BRAND.cream, border: `1px solid ${BRAND.maroonLight}` }}>
          <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ============== INTERVIEW QUESTIONS ==============
const INTERVIEW_QUESTIONS: any[] = [
  { id: "firstName", section: "Personal", q: "Let's start with your full name. What is your first name?", type: "text" },
  { id: "middleName", section: "Personal", q: "Middle name? Say 'skip' if you don't have one.", type: "text", optional: true },
  { id: "lastName", section: "Personal", q: "Last name?", type: "text" },
  { id: "dob", section: "Personal", q: "What is your date of birth? You can say it like 'March 5, 1985'.", type: "date" },
  { id: "ssn", section: "Personal", q: "What is your Social Security number? Format: XXX-XX-XXXX.", type: "text" },
  { id: "phone", section: "Personal", q: "Best phone number to reach you?", type: "tel" },
  { id: "email", section: "Personal", q: "Email address?", type: "email" },
  { id: "position", section: "Personal", q: "What position are you applying for? Options: Company Driver Per Mile, Owner Operator, Lease Purchase, Flat Rate Driver, or Local Driver.", type: "select", options: ["Company Driver — Per Mile", "Owner Operator", "Lease Purchase", "Flat Rate Driver", "Local Driver"] },
  { id: "dateAvailable", section: "Personal", q: "When are you available to start work?", type: "date" },
  { id: "legalRight", section: "Personal", q: "Do you have legal right to work in the United States?", type: "yesno" },
  { id: "_res0_street", section: "Residency", q: "Now your current address. What's the street?", type: "text" },
  { id: "_res0_city", section: "Residency", q: "City?", type: "text" },
  { id: "_res0_state", section: "Residency", q: "State? Two-letter abbreviation works.", type: "text" },
  { id: "_res0_zip", section: "Residency", q: "ZIP code?", type: "text" },
  { id: "_res0_years", section: "Residency", q: "How many years have you lived at this address?", type: "text" },
  { id: "licenseState", section: "License", q: "What state issued your CDL?", type: "text" },
  { id: "licenseNumber", section: "License", q: "What is your CDL license number?", type: "text" },
  { id: "licenseClass", section: "License", q: "What class is your CDL? A, B, or C?", type: "select", options: ["A","B","C"] },
  { id: "licenseEndorsements", section: "License", q: "Any endorsements? H, N, T, X, etc. Say 'none' if none.", type: "text", optional: true },
  { id: "licenseExpiration", section: "License", q: "When does your CDL expire?", type: "date" },
  { id: "medCardExpiration", section: "License", q: "When does your DOT medical card expire?", type: "date" },
  { id: "_exp0_equipment", section: "Experience", q: "What equipment have you driven? Conestoga, Flatbed, Dry Van, Reefer, etc.", type: "text" },
  { id: "_exp0_from", section: "Experience", q: "When did you start driving that type of equipment?", type: "date" },
  { id: "_exp0_miles", section: "Experience", q: "Approximately how many total miles have you driven that equipment?", type: "text" },
  { id: "everDeniedLicense", section: "Record", q: "Have you ever been denied a license, permit, or privilege to operate a motor vehicle?", type: "yesno" },
  { id: "everSuspended", section: "Record", q: "Has any license, permit, or privilege ever been suspended or revoked?", type: "yesno" },
  { id: "everConvictedCMV", section: "Record", q: "Have you ever been convicted of any criminal act involving a commercial motor vehicle, or while driving one?", type: "yesno" },
  { id: "everConvictedLaw", section: "Record", q: "Have you ever been convicted of any law violation? Include guilty pleas, but exclude minor traffic violations.", type: "yesno" },
  { id: "complianceExplain", section: "Record", q: "You answered yes above. Please explain.", type: "textarea", showIf: (d: any) => [d.everDeniedLicense, d.everSuspended, d.everConvictedCMV, d.everConvictedLaw].includes("Yes") },
  { id: "noAccidents", section: "Record", q: "Have you had any accidents in the past 3 years? Yes or No.", type: "yesno_inverse" },
  { id: "noConvictions", section: "Record", q: "Any traffic convictions or forfeitures in the past 3 years? Excluding parking. Yes or No.", type: "yesno_inverse" },
  { id: "_emp0_name", section: "Employment", q: "Now let's cover employment history. What's your current or most recent employer's name?", type: "text" },
  { id: "_emp0_position", section: "Employment", q: "What was your position there?", type: "text" },
  { id: "_emp0_startDate", section: "Employment", q: "When did you start that job?", type: "date" },
  { id: "_emp0_endDate", section: "Employment", q: "When did you end? Or say 'present' if still working there.", type: "date" },
  { id: "_emp0_phone", section: "Employment", q: "Phone number for that employer?", type: "tel" },
  { id: "_emp0_reasonLeaving", section: "Employment", q: "Reason for leaving, or explain any time gaps.", type: "textarea" },
  { id: "_emp0_dotTested", section: "Employment", q: "Were you subject to DOT drug and alcohol testing at that job?", type: "yesno" },
  { id: "_emp0_fmcsaSubject", section: "Employment", q: "Were you subject to FMCSA regulations there?", type: "yesno" },
  { id: "daRefused", section: "D&A", q: "Have you ever refused to be tested for drugs or alcohol?", type: "yesno" },
  { id: "daPositive", section: "D&A", q: "Have you ever tested positive for drugs or alcohol?", type: "yesno" },
  { id: "daPreEmpPositive", section: "D&A", q: "Have you ever tested positive on a pre-employment drug or alcohol test for a job you applied to but didn't get?", type: "yesno" },
  { id: "daExplain", section: "D&A", q: "You answered yes above. Please describe and confirm Return-to-Duty status.", type: "textarea", showIf: (d: any) => [d.daRefused, d.daPositive, d.daPreEmpPositive].includes("Yes") },
  { id: "_edu_hs", section: "Education", q: "What high school did you attend?", type: "text", optional: true },
  { id: "hosTotal", section: "Compliance", q: "How many total on-duty hours have you worked in the past 7 days? Required by §395.8.", type: "text" },
  { id: "hosLastRelieved", section: "Compliance", q: "When were you last relieved from duty? Date and time.", type: "text" },
  { id: "otherEmployer", section: "Other Work", q: "Are you currently working for another employer?", type: "yesno" },
  { id: "otherEmployerIntent", section: "Other Work", q: "Do you intend to work for another employer while employed by Square Transportation?", type: "yesno" }
];

function InterviewMode({ open, onClose, data, setData, onComplete }: any) {
  type Phase = "connecting" | "speaking" | "listening" | "processing" | "error" | "ended";
  const [history, setHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [aiMessage, setAiMessage] = useState("");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [collectedCount, setCollectedCount] = useState(0);
  const tts = useTextToSpeech();
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  // Speech recognition
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);
  const finalTranscriptRef = useRef("");
  const interimRef = useRef("");
  const submitLockRef = useRef(false);

  // Total required fields, for progress display
  const TOTAL_FIELDS = 36;

  // Apply extracted fields from AI to form data — supports dot notation for nested
  const applyExtractedFields = useCallback((fields: Record<string, any>) => {
    if (!fields || Object.keys(fields).length === 0) return;
    setData((prev: any) => {
      const next = JSON.parse(JSON.stringify(prev));
      for (const [key, value] of Object.entries(fields)) {
        if (value == null || value === "") continue;
        if (key.includes(".")) {
          const parts = key.split(".");
          let target: any = next;
          for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i];
            const nextP = parts[i + 1];
            const isArrayIdx = /^\d+$/.test(nextP);
            if (/^\d+$/.test(p)) {
              const idx = parseInt(p);
              while (target.length <= idx) target.push({});
              target = target[idx];
            } else {
              if (!target[p]) target[p] = isArrayIdx ? [] : {};
              target = target[p];
            }
          }
          target[parts[parts.length - 1]] = value;
        } else if (key === "education" && typeof value === "object") {
          next.education = { ...next.education, ...value };
        } else if (key === "noAccidents" || key === "noConvictions") {
          next[key] = value === true || value === "true" || value === "Yes";
        } else {
          next[key] = value;
        }
      }
      return next;
    });
  }, [setData]);

  // Flatten current form data for the API to know what's already collected
  const flattenForState = useCallback((d: any): Record<string, any> => {
    const out: Record<string, any> = {};
    const keys = ["firstName", "middleName", "lastName", "dob", "ssn", "phone", "email",
      "position", "dateAvailable", "legalRight", "licenseState", "licenseNumber",
      "licenseClass", "licenseEndorsements", "licenseExpiration", "medCardExpiration",
      "everDeniedLicense", "everSuspended", "everConvictedCMV", "everConvictedLaw",
      "complianceExplain", "daRefused", "daPositive", "daPreEmpPositive", "daExplain",
      "hosTotal", "hosLastRelieved", "otherEmployer", "otherEmployerIntent"];
    keys.forEach(k => { if (d[k]) out[k] = d[k]; });
    if (d.experience?.[0]?.equipment) {
      out["experience.0.equipment"] = d.experience[0].equipment;
      if (d.experience[0].from) out["experience.0.from"] = d.experience[0].from;
      if (d.experience[0].miles) out["experience.0.miles"] = d.experience[0].miles;
    }
    if (d.employers?.[0]?.name) {
      ["name", "position", "startDate", "endDate", "phone", "reasonLeaving"].forEach(f => {
        if (d.employers[0][f]) out[`employers.0.${f}`] = d.employers[0][f];
      });
    }
    return out;
  }, []);

  // Send a turn to the API
  const sendTurn = useCallback(async (msgs: typeof history) => {
    setPhase("processing");
    setError(null);
    try {
      const currentData = flattenForState(dataRef.current);
      const apiMsgs = msgs.length === 0
        ? [{ role: "user", content: "Start the interview." }]
        : msgs;

      const res = await fetch("/api/interview/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMsgs, currentData }),
      });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error || `Request failed (${res.status})`);
        setPhase("error");
        return;
      }

      // Apply any extracted fields
      if (result.extracted) {
        applyExtractedFields(result.extracted);
        setCollectedCount(c => c + Object.keys(result.extracted).length);
      }

      const assistantMsg = { role: "assistant" as const, content: result.say };
      const newHistory = msgs.length === 0
        ? [{ role: "user" as const, content: "Start the interview." }, assistantMsg]
        : [...msgs, assistantMsg];

      setHistory(newHistory);
      setAiMessage(result.say);

      if (result.done) {
        setPhase("speaking");
        tts.speak(result.say, () => {
          setPhase("ended");
          setTimeout(() => onComplete(), 1500);
        });
        return;
      }

      // Speak then listen
      setPhase("speaking");
      tts.speak(result.say, () => {
        startListening();
      });
    } catch (e: any) {
      setError(e.message || "Network error");
      setPhase("error");
    }
  }, [applyExtractedFields, flattenForState, onComplete, tts]);

  // Start the conversation when opened
  useEffect(() => {
    if (open && history.length === 0 && phase === "connecting") {
      sendTurn([]);
    }
  }, [open, history.length, phase, sendTurn]);

  // Set up speech recognition once
  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + " ";
        else interim += t;
      }
      finalTranscriptRef.current += final;
      interimRef.current = interim;
      setTranscript((finalTranscriptRef.current + interim).trim());
      // Reset silence timer on activity
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        autoSubmit();
      }, 2000);
    };
    r.onerror = (e: any) => {
      if (e.error === "no-speech" || e.error === "aborted") {
        // Restart automatically if still in listening mode
      }
    };
    r.onend = () => {
      // Recognition stopped — handled by submit logic
    };
    recognitionRef.current = r;
    return () => {
      try { r.stop(); } catch (_) { /* noop */ }
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  const startListening = useCallback(() => {
    if (!recognitionRef.current) {
      setError("Speech recognition not supported in this browser. Please use Chrome.");
      setPhase("error");
      return;
    }
    setPhase("listening");
    setTranscript("");
    finalTranscriptRef.current = "";
    interimRef.current = "";
    submitLockRef.current = false;
    try { recognitionRef.current.start(); } catch (_) { /* already started */ }
  }, []);

  const autoSubmit = useCallback(() => {
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    // abort() releases the audio resource IMMEDIATELY, unlike stop() which
    // waits for final results and can hold the audio system hostage for
    // hundreds of ms — that's been blocking the next TTS call from playing.
    try { recognitionRef.current?.abort(); } catch (_) { /* noop */ }
    const text = (finalTranscriptRef.current + interimRef.current).trim();
    if (!text) {
      // Nothing captured — restart listening
      submitLockRef.current = false;
      setTimeout(() => startListening(), 400);
      return;
    }
    setTranscript("");
    setHistory(prev => {
      const next = [...prev, { role: "user" as const, content: text }];
      sendTurn(next);
      return next;
    });
  }, [sendTurn, startListening]);

  const skipQuestion = useCallback(() => {
    if (phase !== "listening" && phase !== "speaking") return;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    try { recognitionRef.current?.stop(); } catch (_) { /* noop */ }
    tts.stop();
    submitLockRef.current = true;
    setTranscript("");
    setHistory(prev => {
      const next = [...prev, { role: "user" as const, content: "Skip this one for now." }];
      sendTurn(next);
      return next;
    });
  }, [phase, sendTurn, tts]);

  const repeatQuestion = useCallback(() => {
    if (!aiMessage) return;
    tts.speak(aiMessage);
  }, [aiMessage, tts]);

  const endCall = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch (_) { /* noop */ }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    tts.stop();
    onClose();
  }, [onClose, tts]);

  const retryFromError = useCallback(() => {
    setError(null);
    if (history.length === 0) {
      sendTurn([]);
    } else {
      sendTurn(history);
    }
  }, [history, sendTurn]);

  if (!open) return null;

  const phaseLabel: Record<Phase, string> = {
    connecting: "Connecting to Graviton...",
    speaking: "Graviton is speaking",
    listening: "Listening...",
    processing: "Graviton is thinking...",
    error: "Connection issue",
    ended: "Interview complete",
  };

  const progress = Math.min(100, Math.round((collectedCount / TOTAL_FIELDS) * 100));

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{
      background: `radial-gradient(ellipse at top, ${BRAND.navyLight} 0%, ${BRAND.navy} 50%, ${BRAND.ink} 100%)`,
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BRAND.gold + "20" }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded" style={{ background: BRAND.maroon }}>
            <MessageCircle size={16} style={{ color: BRAND.gold }} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.25em]" style={{ color: BRAND.gold }}>Voice Interview</div>
            <div className="text-xs" style={{ color: "#8896A8" }}>Graviton · AI Recruiting Assistant</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tts.supported && (
            <button
              onClick={() => {
                const next = tts.cycleVoice();
                // Re-speak current question with new voice so user can hear it
                if (next && aiMessage) {
                  setTimeout(() => tts.speak(aiMessage), 100);
                }
              }}
              title={tts.voiceName ? `Voice: ${tts.voiceName} — tap to switch` : "Switch voice"}
              className="px-2 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold"
              style={{
                background: "transparent",
                color: BRAND.gold,
                border: `1px solid ${BRAND.gold}50`,
                maxWidth: 140,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
              {tts.voiceName ? tts.voiceName.replace(/Microsoft |Desktop|Online/g, "").trim().slice(0, 10) : "Voice"}
            </button>
          )}
          {tts.supported && (
            <button onClick={tts.toggle}
              title={tts.enabled ? "Mute Graviton" : "Unmute Graviton"}
              className="px-2 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold"
              style={{
                background: tts.enabled ? BRAND.gold : "transparent",
                color: tts.enabled ? BRAND.navy : BRAND.gold,
                border: `1px solid ${BRAND.gold}50`
              }}>
              {tts.enabled ? "On" : "Mute"}
            </button>
          )}
          <button onClick={() => setShowLog(s => !s)}
            title="Show transcript"
            className="px-2 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold"
            style={{
              background: showLog ? BRAND.gold : "transparent",
              color: showLog ? BRAND.navy : BRAND.gold,
              border: `1px solid ${BRAND.gold}50`
            }}>
            Log
          </button>
          <button onClick={endCall} className="p-2 rounded" style={{ color: BRAND.cream }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="h-1" style={{ background: "rgba(0,0,0,0.4)" }}>
        <div className="h-full transition-all duration-700" style={{
          width: `${progress}%`,
          background: `linear-gradient(90deg, ${BRAND.maroon}, ${BRAND.gold})`
        }} />
      </div>

      {/* Main interview UI */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 relative">
        {/* Animated avatar */}
        <div className="relative mb-6 flex items-center justify-center" style={{ width: 240, height: 240 }}>
          {/* Voice rings */}
          <svg width="240" height="240" viewBox="0 0 240 240" style={{ position: "absolute", inset: 0 }}>
            {[1, 2, 3].map(i => (
              <circle
                key={i}
                cx="120" cy="120" r="80"
                fill="none"
                stroke={phase === "speaking" ? BRAND.gold : phase === "listening" ? BRAND.maroonLight : BRAND.gold + "30"}
                strokeWidth="2"
                opacity={phase === "speaking" || phase === "listening" ? 0.6 : 0.15}
                style={{
                  transformOrigin: "120px 120px",
                  animation: (phase === "speaking" || phase === "listening")
                    ? `voiceRing 2s ease-out infinite ${i * 0.5}s`
                    : "none",
                }}
              />
            ))}
          </svg>
          <style>{`
            @keyframes voiceRing {
              0% { transform: scale(0.8); opacity: 0.6; }
              100% { transform: scale(1.5); opacity: 0; }
            }
            @keyframes pulse {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.05); opacity: 0.85; }
            }
            @keyframes thinking {
              0%, 100% { opacity: 0.4; }
              50% { opacity: 1; }
            }
          `}</style>

          {/* Avatar circle */}
          <div className="relative rounded-full flex items-center justify-center" style={{
            width: 160,
            height: 160,
            background: `linear-gradient(135deg, ${BRAND.maroon}, ${BRAND.maroonLight})`,
            border: `3px solid ${BRAND.gold}`,
            boxShadow: phase === "speaking" ? `0 0 60px ${BRAND.gold}80` : phase === "listening" ? `0 0 40px ${BRAND.maroonLight}60` : "none",
            animation: phase === "speaking" ? "pulse 1.5s ease-in-out infinite" : "none",
            transition: "box-shadow 0.4s ease",
          }}>
            <div style={{
              fontSize: 72,
              color: BRAND.gold,
              fontFamily: "Oswald, sans-serif",
              fontWeight: 600,
              letterSpacing: "0.05em",
            }}>G</div>
          </div>
        </div>

        {/* Phase indicator */}
        <div className="text-xs uppercase tracking-[0.3em] mb-3" style={{
          color: phase === "listening" ? BRAND.maroonLight : BRAND.gold,
          animation: phase === "processing" ? "thinking 1.2s ease-in-out infinite" : "none",
        }}>
          {phaseLabel[phase]}
        </div>

        {/* Current message / transcript */}
        <div className="max-w-xl w-full text-center min-h-[120px] flex items-start justify-center">
          {phase === "error" ? (
            <div className="p-5 rounded-lg w-full" style={{ background: BRAND.maroon + "30", border: `1px solid ${BRAND.maroonLight}` }}>
              <div className="flex items-start gap-2 mb-3">
                <AlertCircle size={16} style={{ color: BRAND.maroonLight, flexShrink: 0, marginTop: 2 }} />
                <div className="text-sm text-left" style={{ color: BRAND.cream }}>{error}</div>
              </div>
              <div className="flex gap-2 justify-center mt-3">
                <button onClick={retryFromError}
                  className="px-4 py-2 rounded text-xs uppercase tracking-widest font-bold"
                  style={{ background: BRAND.gold, color: BRAND.navy }}>
                  Retry
                </button>
                <button onClick={onClose}
                  className="px-4 py-2 rounded text-xs uppercase tracking-widest font-bold"
                  style={{ background: "transparent", color: BRAND.gold, border: `1px solid ${BRAND.gold}50` }}>
                  Switch to Form
                </button>
              </div>
            </div>
          ) : phase === "listening" || (phase === "processing" && transcript) ? (
            <div className="w-full">
              <div className="text-sm leading-relaxed mb-3" style={{ color: "#8896A8", whiteSpace: "pre-wrap" }}>
                {aiMessage}
              </div>
              <div className="px-4 py-3 rounded-lg text-base leading-relaxed text-left" style={{
                background: BRAND.maroon + "30",
                border: `1px solid ${BRAND.maroon}80`,
                color: BRAND.cream,
                minHeight: "60px",
              }}>
                {transcript || (
                  <span style={{ color: "#5A6878", fontStyle: "italic" }}>
                    Speak your answer — I'll wait until you're done...
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="px-5 py-4 rounded-lg text-base leading-relaxed" style={{
              background: BRAND.navyLight,
              border: `1px solid ${BRAND.gold}30`,
              color: BRAND.cream,
              whiteSpace: "pre-wrap",
            }}>
              {aiMessage || (phase === "connecting" ? "..." : "")}
            </div>
          )}
        </div>
      </div>

      {/* Action bar */}
      <div className="border-t px-4 sm:px-8 py-4" style={{ borderColor: BRAND.gold + "20", background: BRAND.navy }}>
        <div className="max-w-xl mx-auto flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={autoSubmit}
            disabled={phase !== "listening" || !transcript.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded text-xs uppercase tracking-widest font-bold disabled:opacity-30"
            style={{ background: BRAND.gold, color: BRAND.navy, minWidth: 140 }}>
            Done speaking
          </button>
          <button
            onClick={repeatQuestion}
            disabled={!aiMessage || phase === "speaking" || phase === "processing"}
            className="px-3 py-2.5 rounded text-xs uppercase tracking-widest font-bold disabled:opacity-30 flex items-center gap-1.5"
            style={{ color: BRAND.gold, border: `1px solid ${BRAND.gold}40`, background: "transparent" }}>
            <Volume2 size={13} /> Repeat
          </button>
          <button
            onClick={skipQuestion}
            disabled={phase !== "listening" && phase !== "speaking"}
            className="px-3 py-2.5 rounded text-xs uppercase tracking-widest font-bold disabled:opacity-30"
            style={{ color: "#8896A8", border: `1px solid #8896A840`, background: "transparent" }}>
            Skip
          </button>
          <button
            onClick={endCall}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded text-xs uppercase tracking-widest font-bold"
            style={{ background: BRAND.maroon, color: BRAND.cream }}>
            End Call
          </button>
        </div>
        <div className="mt-3 text-center text-[10px] uppercase tracking-widest" style={{ color: "#5A6878" }}>
          {phase === "listening"
            ? "Auto-submits after 2 seconds of silence"
            : phase === "speaking"
              ? "Graviton is speaking — listening will start automatically"
              : `${collectedCount}/${TOTAL_FIELDS} fields collected`}
        </div>
      </div>

      {/* Transcript log overlay */}
      {showLog && (
        <div className="absolute inset-0 z-10 flex flex-col" style={{ background: BRAND.ink + "f8" }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BRAND.gold + "20" }}>
            <div className="text-xs uppercase tracking-[0.25em]" style={{ color: BRAND.gold }}>Conversation Log</div>
            <button onClick={() => setShowLog(false)} className="p-2" style={{ color: BRAND.cream }}>
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-3 max-w-2xl mx-auto w-full">
            {history.filter(m => m.content !== "Start the interview.").map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed" style={{
                  background: m.role === "user" ? BRAND.maroon : BRAND.navyLight,
                  color: BRAND.cream,
                  whiteSpace: "pre-wrap",
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {history.length <= 1 && (
              <div className="text-center text-sm py-8" style={{ color: "#5A6878" }}>
                Conversation will appear here as you talk with Graviton.
              </div>
            )}
            {/* TTS DEBUG LOG — shows exactly what speech synthesis is doing.
                If Q2+ aren't speaking, this will tell you why. */}
            {tts.debugLog && tts.debugLog.length > 0 && (
              <div className="mt-6 pt-4 border-t" style={{ borderColor: BRAND.gold + "20" }}>
                <div className="text-[10px] uppercase tracking-[0.25em] mb-2" style={{ color: BRAND.gold }}>
                  TTS Debug (last 10 events)
                </div>
                <div className="font-mono text-[11px] space-y-1" style={{ color: "#8896A8" }}>
                  {tts.debugLog.map((line: string, i: number) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


function AIAssistant({ open, onClose, formData, setFormData, currentStep, stepName }: any) {
  const [messages, setMessages] = useState<any[]>([
    { role: "assistant", content: "Hi — I'm your onboarding assistant. Ask me anything about the application, or use the **Voice Apply** button to fill the form by talking. I can answer DOT/FMCSA questions, explain what each field means, or help you draft your employment history." }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceMode, setVoiceMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const speech = useSpeech(({ full }) => setVoiceTranscript(full));

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text: string) => {
    const userMsg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const system = `You are the AI assistant for Square Transportation Solution Inc (MC-728978), helping a driver complete their FMCSA-compliant application. The driver is on step "${stepName}". The current form state is: ${JSON.stringify(formData).slice(0, 2000)}.\n\nBe concise. Answer DOT/FMCSA questions plainly. Reference 49 CFR Parts 383, 391, 382 when relevant.`;
      const reply = await askClaude(next.map(m => ({ role: m.role, content: m.content })), system);
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: "Error: " + e.message }]);
    }
    setLoading(false);
  };

  const submitVoiceApply = async () => {
    if (!voiceTranscript.trim()) return;
    setLoading(true);
    setVoiceMode(false);
    const transcript = voiceTranscript;
    setVoiceTranscript("");
    setMessages(prev => [...prev, { role: "user", content: `Voice apply: "${transcript}"` }]);
    try {
      const system = `Extract structured data from a driver's spoken application. Output ONLY a JSON object — no preamble, no markdown fences.\n\nAvailable fields: firstName, middleName, lastName, dob (YYYY-MM-DD), ssn, email, phone, position, dateAvailable (YYYY-MM-DD), legalRight (Yes/No), licenseState (2-letter), licenseNumber, licenseClass (A/B/C), licenseEndorsements, licenseExpiration (YYYY-MM-DD), medCardExpiration (YYYY-MM-DD), education.hs, education.college, education.other.\n\nOnly include fields the driver clearly mentioned. Return valid JSON only.`;
      const reply = await askClaude([{ role: "user", content: transcript }], system, "claude-sonnet-4-6");
      const cleaned = reply.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      setFormData((prev: any) => {
        const next = { ...prev };
        Object.keys(parsed).forEach(k => {
          if (k === "education") next.education = { ...next.education, ...parsed.education };
          else if (parsed[k] != null && parsed[k] !== "") next[k] = parsed[k];
        });
        return next;
      });
      const filled = Object.keys(parsed).filter(k => parsed[k]).join(", ");
      setMessages(prev => [...prev, { role: "assistant", content: `✓ Filled: **${filled}**. Review before continuing.` }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: "assistant", content: "Couldn't parse — try again with clearer field statements." }]);
    }
    setLoading(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] z-50 flex flex-col shadow-2xl"
         style={{ background: BRAND.ink, borderLeft: `1px solid ${BRAND.gold}30` }}>
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BRAND.gold + "20", background: BRAND.navy }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md" style={{ background: BRAND.maroon }}><Sparkles size={16} style={{ color: BRAND.gold }} /></div>
          <div>
            <div className="text-xs uppercase tracking-[0.25em]" style={{ color: BRAND.gold }}>STS Assistant</div>
            <div className="text-xs" style={{ color: "#8896A8" }}>AI-powered onboarding help</div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded" style={{ color: BRAND.cream }}><X size={18} /></button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className="max-w-[85%] px-3.5 py-2.5 rounded-lg text-sm leading-relaxed"
              style={{ background: m.role === "user" ? BRAND.maroon : BRAND.navyLight, color: BRAND.cream, whiteSpace: "pre-wrap" }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex items-center gap-2 text-sm" style={{ color: BRAND.gold }}>
            <Loader2 size={14} className="animate-spin" /> Thinking...
          </div>
        )}
      </div>

      {voiceMode && (
        <div className="px-4 py-3 border-t" style={{ borderColor: BRAND.gold + "30", background: BRAND.navy }}>
          <div className="text-[10px] uppercase tracking-[0.25em] mb-2 flex items-center gap-1.5" style={{ color: BRAND.gold }}><Mic size={11} /> Voice Apply — Speak Freely</div>
          <div className="min-h-[60px] p-3 rounded text-sm mb-2" style={{ background: "rgba(0,0,0,0.4)", color: BRAND.cream }}>
            {voiceTranscript || <span style={{ color: "#5A6878" }}>Start talking...</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={speech.listening ? speech.stop : speech.start}
              className="flex-1 py-2 rounded font-semibold text-xs uppercase tracking-widest flex items-center justify-center gap-2"
              style={{ background: speech.listening ? BRAND.maroon : BRAND.gold, color: speech.listening ? BRAND.cream : BRAND.navy }}>
              {speech.listening ? <><MicOff size={14} /> Stop</> : <><Mic size={14} /> Record</>}
            </button>
            <button onClick={submitVoiceApply} disabled={!voiceTranscript || loading}
              className="flex-1 py-2 rounded font-semibold text-xs uppercase tracking-widest disabled:opacity-40"
              style={{ background: BRAND.maroon, color: BRAND.cream }}>Apply to Form</button>
            <button onClick={() => { setVoiceMode(false); setVoiceTranscript(""); speech.stop(); }}
              className="px-3 py-2 rounded text-xs" style={{ color: BRAND.gold, border: `1px solid ${BRAND.gold}40` }}>Cancel</button>
          </div>
        </div>
      )}

      <div className="p-4 border-t" style={{ borderColor: BRAND.gold + "20" }}>
        {!voiceMode && (
          <button onClick={() => { setVoiceMode(true); setTimeout(() => speech.start(), 200); }}
            className="w-full mb-2 py-2 rounded text-xs uppercase tracking-[0.2em] font-bold flex items-center justify-center gap-2"
            style={{ background: BRAND.gold, color: BRAND.navy }} disabled={!speech.supported}>
            <Mic size={14} /> Voice Apply
          </button>
        )}
        <div className="flex gap-2">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && input.trim() && send(input)}
            placeholder="Ask about any field..."
            className="flex-1 px-3 py-2 text-sm rounded border outline-none"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: BRAND.gold + "30", color: BRAND.cream }} />
          <button onClick={() => input.trim() && send(input)} disabled={!input.trim() || loading}
            className="px-3 rounded disabled:opacity-40" style={{ background: BRAND.maroon, color: BRAND.cream }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children, icon: Icon }: any) {
  return (
    <div className="rounded-lg p-6 sm:p-8 mb-5" style={{
      background: "linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
      border: `1px solid ${BRAND.gold}25`
    }}>
      <div className="flex items-start gap-3 mb-6 pb-4" style={{ borderBottom: `1px solid ${BRAND.gold}20` }}>
        {Icon && (
          <div className="p-2.5 rounded-md flex-shrink-0" style={{ background: BRAND.maroon }}>
            <Icon size={20} style={{ color: BRAND.gold }} />
          </div>
        )}
        <div>
          <h2 className="text-2xl sm:text-3xl tracking-wide mb-1" style={{ color: BRAND.cream, fontFamily: "Oswald, sans-serif", letterSpacing: "0.04em" }}>{title}</h2>
          {subtitle && <p className="text-sm" style={{ color: "#8896A8" }}>{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

function StepWelcome({ next, startInterview }: any) {
  return (
    <div className="text-center py-8 sm:py-12">
      <div className="inline-block px-4 py-1.5 rounded-full mb-6 text-[10px] uppercase tracking-[0.3em]"
        style={{ background: BRAND.maroon + "30", color: BRAND.gold, border: `1px solid ${BRAND.gold}40` }}>
        MC-728978 · DOT-2089206 · FMCSA Compliant
      </div>
      <h1 className="text-5xl sm:text-7xl mb-4" style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, letterSpacing: "0.02em", color: BRAND.cream, lineHeight: 0.95 }}>
        DRIVER ONBOARDING
      </h1>
      <div className="text-2xl mb-2" style={{ color: BRAND.gold, fontFamily: "Oswald, sans-serif", letterSpacing: "0.4em" }}>
        GO BIG · GO SQUARE
      </div>
      <p className="max-w-xl mx-auto mt-6 mb-10 text-sm sm:text-base" style={{ color: "#A8B6C8", lineHeight: 1.7 }}>
        Welcome to Square Transportation Solution Inc. Complete your Driver Qualification File by speaking with Graviton, our AI assistant — or fill out the form yourself.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto mb-8">
        <button onClick={startInterview}
          className="text-left p-6 rounded-lg transition-all hover:scale-[1.02]"
          style={{
            background: `linear-gradient(135deg, ${BRAND.maroon}, ${BRAND.maroonLight})`,
            border: `2px solid ${BRAND.gold}`,
            cursor: "pointer"
          }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="px-2 py-0.5 rounded text-[9px] uppercase tracking-[0.2em] font-bold"
              style={{ background: BRAND.gold, color: BRAND.navy }}>Recommended</div>
          </div>
          <MessageCircle size={28} style={{ color: BRAND.gold }} className="mb-3" />
          <div className="text-xl mb-1" style={{ color: BRAND.cream, fontFamily: "Oswald, sans-serif", letterSpacing: "0.05em" }}>
            VOICE INTERVIEW
          </div>
          <div className="text-xs mb-3" style={{ color: BRAND.cream + "cc" }}>
            Talk to Graviton, our AI assistant, like a real phone interview. It asks, you speak. ~10–15 min.
          </div>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold" style={{ color: BRAND.gold }}>
            Start Voice Interview <ChevronRight size={14} />
          </div>
        </button>

        <button onClick={next}
          className="text-left p-6 rounded-lg transition-all hover:scale-[1.02]"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${BRAND.gold}40`,
            cursor: "pointer"
          }}>
          <div className="h-[22px] mb-3"></div>
          <FileText size={28} style={{ color: BRAND.gold }} className="mb-3" />
          <div className="text-xl mb-1" style={{ color: BRAND.cream, fontFamily: "Oswald, sans-serif", letterSpacing: "0.05em" }}>
            FILL FORM MANUALLY
          </div>
          <div className="text-xs mb-3" style={{ color: "#A8B6C8" }}>
            9-step wizard. Type or speak each field. ~30–40 minutes.
          </div>
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold" style={{ color: BRAND.gold }}>
            Begin Form <ChevronRight size={14} />
          </div>
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-3 max-w-3xl mx-auto mb-6">
        {[
          { icon: Mic, label: "Voice Enabled", desc: "Speak your answers" },
          { icon: Sparkles, label: "AI-Powered", desc: "Smart field extraction" },
          { icon: Shield, label: "FMCSA Compliant", desc: "All Part 391 forms" }
        ].map((f: any, i) => (
          <div key={i} className="p-4 rounded-lg" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BRAND.gold}20` }}>
            <f.icon size={20} style={{ color: BRAND.gold }} className="mx-auto mb-2" />
            <div className="text-sm font-bold" style={{ color: BRAND.cream, fontFamily: "Oswald, sans-serif", letterSpacing: "0.08em" }}>{f.label}</div>
            <div className="text-xs mt-1" style={{ color: "#8896A8" }}>{f.desc}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs" style={{ color: "#5A6878" }}>Progress saved automatically · You can switch modes anytime</div>
    </div>
  );
}

// =================== Step components (form mode) ===================

function StepPersonal({ data, set }: any) {
  return (
    <Section title="Personal Information" subtitle="49 CFR §391.21(b)(2)" icon={User}>
      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <Field label="First Name" required><VoiceInput value={data.firstName} onChange={(v: string) => set("firstName", v)} /></Field>
        <Field label="Middle Name"><VoiceInput value={data.middleName} onChange={(v: string) => set("middleName", v)} /></Field>
        <Field label="Last Name" required><VoiceInput value={data.lastName} onChange={(v: string) => set("lastName", v)} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <Field label="Date of Birth" required><VoiceInput type="date" value={data.dob} onChange={(v: string) => set("dob", v)} /></Field>
        <Field label="SSN" required><VoiceInput value={data.ssn} onChange={(v: string) => set("ssn", v)} placeholder="XXX-XX-XXXX" /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <Field label="Email" required><VoiceInput type="email" value={data.email} onChange={(v: string) => set("email", v)} /></Field>
        <Field label="Phone" required><VoiceInput type="tel" value={data.phone} onChange={(v: string) => set("phone", v)} /></Field>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <Field label="Position" required>
          <Select value={data.position} onChange={(v: string) => set("position", v)}
            options={["Company Driver — Per Mile", "Owner Operator", "Lease Purchase", "Flat Rate Driver", "Local Driver"]} />
        </Field>
        <Field label="Date Available" required><VoiceInput type="date" value={data.dateAvailable} onChange={(v: string) => set("dateAvailable", v)} /></Field>
        <Field label="Legal Right to Work" required><YesNo value={data.legalRight} onChange={(v: string) => set("legalRight", v)} /></Field>
      </div>
    </Section>
  );
}

function StepLicense({ data, set }: any) {
  return (
    <Section title="License & Experience" subtitle="49 CFR §391.21(b)(7)" icon={FileText}>
      <div className="grid sm:grid-cols-5 gap-3 mb-5">
        <Field label="State"><Select value={data.licenseState} onChange={(v: string) => set("licenseState", v)} options={STATES} /></Field>
        <Field label="License #" required><VoiceInput value={data.licenseNumber} onChange={(v: string) => set("licenseNumber", v)} /></Field>
        <Field label="Class" required><Select value={data.licenseClass} onChange={(v: string) => set("licenseClass", v)} options={["A","B","C"]} /></Field>
        <Field label="Endorsements"><VoiceInput value={data.licenseEndorsements} onChange={(v: string) => set("licenseEndorsements", v)} placeholder="H, N, T, X" /></Field>
        <Field label="Expiration" required><VoiceInput type="date" value={data.licenseExpiration} onChange={(v: string) => set("licenseExpiration", v)} /></Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <Field label="Med Card Expiration" required><VoiceInput type="date" value={data.medCardExpiration} onChange={(v: string) => set("medCardExpiration", v)} /></Field>
      </div>
    </Section>
  );
}

function StepRecord({ data, set }: any) {
  return (
    <Section title="Record" subtitle="Past 3 years · §391.21(b)(8)–(9)" icon={AlertCircle}>
      <div className="space-y-3 mb-5">
        {[
          ["everDeniedLicense", "Have you ever been denied a license, permit, or privilege to operate a motor vehicle?"],
          ["everSuspended", "Has any license, permit, or privilege ever been suspended or revoked?"],
          ["everConvictedCMV", "Have you ever been convicted of any criminal act involving a CMV?"],
          ["everConvictedLaw", "Have you ever been convicted of any law violation? (Excluding minor traffic.)"]
        ].map(([key, q]) => (
          <div key={key} className="grid sm:grid-cols-[1fr_140px] gap-3 items-center">
            <div className="text-sm" style={{ color: BRAND.cream }}>{q}</div>
            <YesNo value={data[key as string]} onChange={(v: string) => set(key, v)} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function StepEmployment({ data, set }: any) {
  return (
    <Section title="Employment History" subtitle="10 years required · §391.21(b)(10–11)" icon={Briefcase}>
      {data.employers.map((emp: any, i: number) => (
        <div key={i} className="mb-5 p-4 rounded-lg" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${BRAND.gold}20` }}>
          <div className="text-xs uppercase tracking-[0.25em] font-bold mb-3" style={{ color: BRAND.gold }}>{i === 0 ? "Current / Most Recent" : `Previous ${i}`}</div>
          <div className="grid sm:grid-cols-3 gap-3 mb-3">
            <Field label="Business Name" required><VoiceInput value={emp.name} onChange={(v: string) => { const n = [...data.employers]; n[i] = { ...n[i], name: v }; set("employers", n); }} /></Field>
            <Field label="Phone"><VoiceInput type="tel" value={emp.phone} onChange={(v: string) => { const n = [...data.employers]; n[i] = { ...n[i], phone: v }; set("employers", n); }} /></Field>
            <Field label="Position"><VoiceInput value={emp.position} onChange={(v: string) => { const n = [...data.employers]; n[i] = { ...n[i], position: v }; set("employers", n); }} /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <Field label="Start" required><VoiceInput type="date" value={emp.startDate} onChange={(v: string) => { const n = [...data.employers]; n[i] = { ...n[i], startDate: v }; set("employers", n); }} /></Field>
            <Field label="End" required><VoiceInput type="date" value={emp.endDate} onChange={(v: string) => { const n = [...data.employers]; n[i] = { ...n[i], endDate: v }; set("employers", n); }} /></Field>
          </div>
          <Field label="Reason for Leaving">
            <VoiceInput multiline value={emp.reasonLeaving} onChange={(v: string) => { const n = [...data.employers]; n[i] = { ...n[i], reasonLeaving: v }; set("employers", n); }} />
          </Field>
        </div>
      ))}
      <button onClick={() => set("employers", [...data.employers, blankEmployer()])} className="text-xs uppercase tracking-widest py-2 px-4 rounded border flex items-center gap-1.5" style={{ color: BRAND.gold, borderColor: BRAND.gold + "40" }}>
        <Plus size={12} /> Add employer
      </button>
    </Section>
  );
}

function StepDA({ data, set }: any) {
  return (
    <Section title="Drug & Alcohol Disclosure" subtitle="49 CFR Part 382" icon={Pill}>
      <div className="space-y-3 mb-6">
        {[
          ["daRefused", "Have you ever refused to be tested for drugs or alcohol?"],
          ["daPositive", "Have you ever tested positive for drugs or alcohol?"],
          ["daPreEmpPositive", "Have you ever tested positive on a pre-employment test?"]
        ].map(([k, q]) => (
          <div key={k} className="grid sm:grid-cols-[1fr_140px] gap-3 items-center">
            <div className="text-sm" style={{ color: BRAND.cream }}>{q}</div>
            <YesNo value={data[k as string]} onChange={(v: string) => set(k, v)} />
          </div>
        ))}
      </div>
    </Section>
  );
}

function StepDocs({ data, set, files, setFiles }: any) {
  const updateFile = (key: string) => (f: any) => setFiles({ ...files, [key]: f });
  const requiredKeys = ["cdlFront", "cdlBack", "medCard", "ssn"];
  const uploadedRequired = requiredKeys.filter(k => files[k]).length;
  const allRequiredDone = uploadedRequired === requiredKeys.length;

  return (
    <Section title="Document Uploads" subtitle="Required documents for FMCSA Driver Qualification File" icon={FilePlus}>
      <div className="mb-5 p-3 rounded-lg" style={{ background: BRAND.navyLight, border: `1px solid ${BRAND.gold}30` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-[0.25em] font-bold" style={{ color: BRAND.gold }}>
            Required Documents
          </div>
          <div className="text-xs font-bold" style={{ color: allRequiredDone ? BRAND.gold : BRAND.maroonLight }}>
            {uploadedRequired} / {requiredKeys.length}
          </div>
        </div>
        <div className="text-[11px]" style={{ color: "#8896A8", lineHeight: 1.5 }}>
          Tap "Take Photo" to use your phone camera. Lay each document flat on a dark surface, fill the frame, and avoid glare. Photos auto-compress before upload.
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <UploadZone label="CDL — Front" required hint="Front side of your Commercial Driver's License"
          file={files.cdlFront} onFile={updateFile("cdlFront")} />
        <UploadZone label="CDL — Back" required hint="Back side of your CDL (with restrictions/endorsements)"
          file={files.cdlBack} onFile={updateFile("cdlBack")} />
        <UploadZone label="Medical Card" required hint="DOT Medical Examiner's Certificate"
          file={files.medCard} onFile={updateFile("medCard")} />
        <UploadZone label="Social Security Card" required hint="For I-9 verification — replaces voice SSN entry"
          file={files.ssn} onFile={updateFile("ssn")} />
      </div>

      <div className="mb-3 mt-6 text-xs uppercase tracking-[0.25em] font-bold" style={{ color: "#8896A8" }}>
        Optional Documents
      </div>
      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <UploadZone label="Voided Check" hint="For ACH direct deposit setup"
          file={files.check} onFile={updateFile("check")} />
        <UploadZone label="W-9" hint="Tax ID form (owner-operators)"
          file={files.w9} onFile={updateFile("w9")} />
        <UploadZone label="Prior Employment Verification" hint="Signed verification from previous employer"
          file={files.priorEmp} onFile={updateFile("priorEmp")} />
        <UploadZone label="MVR / Driving Record" hint="Recent Motor Vehicle Record (we can pull this for you)"
          file={files.mvr} onFile={updateFile("mvr")} />
      </div>

      {!allRequiredDone && (
        <div className="mt-5 p-3 rounded-lg flex items-start gap-2"
          style={{ background: BRAND.maroon + "20", border: `1px solid ${BRAND.maroon}` }}>
          <AlertCircle size={16} style={{ color: BRAND.maroonLight, flexShrink: 0, marginTop: 2 }} />
          <div className="text-xs" style={{ color: BRAND.cream, lineHeight: 1.5 }}>
            You can submit your application without all required documents, but you'll need to provide them before your first dispatch. We'll follow up.
          </div>
        </div>
      )}
    </Section>
  );
}

function StepAuth({ data, set, signature, setSignature }: any) {
  const auths: any[] = [
    ["authMVR", "MVR Release — I authorize Square Transportation to obtain my Motor Vehicle Records."],
    ["authPSP", "PSP Release — I authorize FMCSA Pre-Employment Screening Program access."],
    ["authClearinghouse", "Clearinghouse Consent — I consent to FMCSA Drug & Alcohol Clearinghouse queries."],
    ["authDA", "Drug & Alcohol Testing — I agree to all required testing per Part 382."],
    ["authFCRA", "Fair Credit Reporting Act Disclosure."],
    ["authHandbook", "Employee Handbook Acknowledgment."],
    ["authDLCert", "I certify I do not possess more than one driver's license per §383.21."],
    ["authOtherWork", "I will inform Square Transportation of any additional employment."]
  ];
  return (
    <Section title="Authorizations & E-Signature" icon={PenTool}>
      <div className="space-y-4 mb-8">
        {auths.map(([key, text]) => (
          <div key={key} className="p-3 rounded" style={{ background: "rgba(0,0,0,0.2)", border: `1px solid ${BRAND.gold}15` }}>
            <Checkbox checked={data[key]} onChange={(v: boolean) => set(key, v)} label={text} />
          </div>
        ))}
      </div>
      <div className="text-xs uppercase tracking-[0.25em] font-bold mb-3" style={{ color: BRAND.gold }}>E-Signature</div>
      <SignaturePad value={signature} onChange={setSignature} />
    </Section>
  );
}

function StepReview({ data, files, signature, signatureValid, allAuthsChecked, completionScore }: any) {
  return (
    <Section title="Review & Submit" icon={ClipboardCheck}>
      <div className="mb-6 p-4 rounded-lg" style={{ background: BRAND.navyLight, border: `1px solid ${BRAND.gold}30` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-[0.25em] font-bold" style={{ color: BRAND.gold }}>Application Completeness</div>
          <div className="text-2xl font-bold" style={{ color: BRAND.cream, fontFamily: "Oswald, sans-serif" }}>{completionScore}%</div>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.4)" }}>
          <div className="h-full transition-all" style={{ width: `${completionScore}%`, background: `linear-gradient(90deg, ${BRAND.maroon}, ${BRAND.gold})` }} />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm" style={{ color: signatureValid ? "#7BC97B" : BRAND.maroonLight }}>
          {signatureValid ? <Check size={14} /> : <AlertCircle size={14} />} E-Signature {signatureValid ? "captured" : "missing"}
        </div>
        <div className="flex items-center gap-2 text-sm" style={{ color: allAuthsChecked ? "#7BC97B" : BRAND.maroonLight }}>
          {allAuthsChecked ? <Check size={14} /> : <AlertCircle size={14} />} All authorizations {allAuthsChecked ? "agreed" : "incomplete"}
        </div>
      </div>
    </Section>
  );
}

function StepDone({ data, downloadJson, submitResult }: any) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6" style={{ background: BRAND.gold + "20", border: `2px solid ${BRAND.gold}` }}>
        <Check size={40} style={{ color: BRAND.gold }} strokeWidth={2.5} />
      </div>
      <h1 className="text-4xl sm:text-5xl mb-3" style={{ fontFamily: "Oswald, sans-serif", color: BRAND.cream, letterSpacing: "0.04em" }}>APPLICATION SUBMITTED</h1>
      <p className="max-w-lg mx-auto mb-8 text-sm" style={{ color: "#8896A8" }}>
        Thank you, {data.firstName}. Your DQF has been submitted. We'll contact you at <strong style={{ color: BRAND.cream }}>{data.phone}</strong> within 24 hours.
      </p>

      {submitResult?.applicationId && (
        <div className="max-w-md mx-auto mb-6 p-4 rounded-lg text-left" style={{ background: BRAND.navyLight, border: `1px solid ${BRAND.gold}30` }}>
          <div className="text-[10px] uppercase tracking-[0.25em] font-bold mb-2" style={{ color: BRAND.gold }}>Application Reference</div>
          <div className="text-sm font-mono" style={{ color: BRAND.cream }}>{submitResult.applicationId}</div>
          <div className="text-xs mt-2" style={{ color: "#8896A8" }}>Save this ID for your records</div>
        </div>
      )}

      <div className="flex items-center justify-center gap-3 flex-wrap">
        {submitResult?.pdfUrl && (
          <a href={submitResult.pdfUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded text-xs uppercase tracking-[0.25em] font-bold"
            style={{ background: BRAND.gold, color: BRAND.navy }}>
            <Download size={14} /> Download Signed DQF (PDF)
          </a>
        )}
        <button onClick={downloadJson} className="inline-flex items-center gap-2 px-5 py-2.5 rounded text-xs uppercase tracking-[0.25em] font-bold"
          style={{ background: "transparent", color: BRAND.gold, border: `1px solid ${BRAND.gold}40` }}>
          <Download size={14} /> Application Data (JSON)
        </button>
      </div>

      {submitResult?.sms?.sent && (
        <div className="mt-6 text-xs" style={{ color: "#7BC97B" }}>
          ✓ Recruiting team notified
        </div>
      )}
    </div>
  );
}

const STEPS: any[] = [
  { id: "welcome", label: "Welcome", icon: Truck },
  { id: "personal", label: "Personal", icon: User },
  { id: "license", label: "License", icon: FileText },
  { id: "record", label: "Record", icon: AlertCircle },
  { id: "employment", label: "Employment", icon: Briefcase },
  { id: "da", label: "Drug & Alcohol", icon: Pill },
  { id: "docs", label: "Documents", icon: FilePlus },
  { id: "auth", label: "Authorize", icon: PenTool },
  { id: "review", label: "Review", icon: ClipboardCheck },
  { id: "done", label: "Submitted", icon: Check }
];

export default function App() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState(DEFAULT_FORM);
  const [files, setFiles] = useState<any>({});
  const [signature, setSignature] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [interviewOpen, setInterviewOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = loadProgress();
    if (saved) {
      if (saved.data) setData(saved.data);
      if (saved.step != null) setStep(saved.step);
      if (saved.files) setFiles(saved.files);
      if (saved.signature) setSignature(saved.signature);
      setRestored(true);
      setTimeout(() => setRestored(false), 4000);
    }
  }, []);

  useEffect(() => {
    if (mounted) saveProgress({ data, step, files, signature });
  }, [data, step, files, signature, mounted]);

  const set = (key: string, value: any) => setData((prev: any) => ({ ...prev, [key]: value }));

  const allAuthsChecked = data.authMVR && data.authPSP && data.authClearinghouse &&
    data.authDA && data.authFCRA && data.authHandbook && data.authDLCert && data.authOtherWork;
  const signatureValid = !!signature && signature.length > 200;

  const completionScore = (() => {
    let total = 0, filled = 0;
    const required = ["firstName","lastName","dob","ssn","email","phone","position",
      "licenseState","licenseNumber","licenseClass","licenseExpiration","medCardExpiration",
      "everDeniedLicense","everSuspended","everConvictedCMV","everConvictedLaw",
      "daRefused","daPositive","daPreEmpPositive"];
    required.forEach(f => { total++; if (data[f]) filled++; });
    if (data.employers[0]?.name) filled += 5;
    total += 5;
    if (signatureValid) filled += 3;
    total += 3;
    if (allAuthsChecked) filled += 5;
    total += 5;
    Object.values(files).forEach(f => { total++; if (f) filled++; });
    if (total < 30) total = 30;
    return Math.min(100, Math.round((filled / total) * 100));
  })();

  const next = () => setStep(s => Math.min(STEPS.length - 1, s + 1));
  const prev = () => setStep(s => Math.max(0, s - 1));

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<any>(null);

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Compress images client-side before send
      const compressedFiles = await compressAllFiles(files);
      const totalMB = calcTotalSizeMB(compressedFiles, signature);
      if (totalMB > 4) {
        setSubmitError(`Total upload size is ${totalMB.toFixed(1)}MB — exceeds 4MB limit. Try smaller photos.`);
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, files: compressedFiles, signature }),
      });
      const result = await res.json();
      if (!res.ok) {
        setSubmitError(result.error || `Submission failed (HTTP ${res.status})`);
        setSubmitting(false);
        return;
      }
      setSubmitResult(result);
      // Clear stored progress on successful submit
      localStorage.removeItem(STORAGE_KEY);
      setStep(STEPS.length - 1);
    } catch (e: any) {
      setSubmitError("Network error: " + e.message);
    }
    setSubmitting(false);
  };

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify({ data, signature: signature ? "signed" : null }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `STS-Application-${data.lastName || "Driver"}.json`;
    a.click();
  };

  const reset = () => {
    if (confirm("Reset all form data and start over?")) {
      localStorage.removeItem(STORAGE_KEY);
      setData(DEFAULT_FORM);
      setFiles({});
      setSignature("");
      setStep(0);
    }
  };

  const stepName = STEPS[step].label;

  if (!mounted) return null;

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{
      background: `radial-gradient(ellipse at top, ${BRAND.navyLight} 0%, ${BRAND.navy} 50%, ${BRAND.ink} 100%)`
    }}>
      <header className="relative z-10 border-b" style={{ borderColor: BRAND.gold + "20", background: BRAND.navy + "ee", backdropFilter: "blur(20px)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 flex-shrink-0">
              <div className="absolute inset-0 rounded-md transform rotate-45" style={{ background: BRAND.maroon }} />
              <div className="absolute inset-1 rounded transform rotate-45 flex items-center justify-center" style={{ background: BRAND.navy }}>
                <span className="text-xs font-black transform -rotate-45" style={{ color: BRAND.gold, fontFamily: "Oswald, sans-serif" }}>STS</span>
              </div>
            </div>
            <div>
              <div className="text-lg sm:text-xl tracking-wider" style={{ color: BRAND.cream, fontFamily: "Oswald, sans-serif", letterSpacing: "0.1em", fontWeight: 600 }}>
                SQUARE TRANSPORTATION
              </div>
              <div className="text-[10px] uppercase tracking-[0.3em]" style={{ color: BRAND.gold }}>
                Driver Onboarding · MC-728978
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setInterviewOpen(true)} title="Voice interview"
              className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-md text-xs uppercase tracking-widest font-bold"
              style={{ background: BRAND.gold, color: BRAND.navy, fontFamily: "Oswald, sans-serif" }}>
              <MessageCircle size={12} /> Interview
            </button>
            <button onClick={reset} title="Reset form"
              className="hidden sm:flex items-center gap-1 px-2 py-2 rounded-md text-xs uppercase tracking-widest"
              style={{ color: BRAND.maroonLight, border: `1px solid ${BRAND.maroon}40` }}>
              Reset
            </button>
            <button onClick={() => setAiOpen(true)} className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-xs uppercase tracking-widest font-bold"
              style={{ background: BRAND.maroon, color: BRAND.cream, fontFamily: "Oswald, sans-serif" }}>
              <Sparkles size={14} style={{ color: BRAND.gold }} />
              <span className="hidden sm:inline">AI Help</span>
            </button>
          </div>
        </div>

        {step > 0 && step < STEPS.length - 1 && (
          <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-4">
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {STEPS.slice(1, -1).map((s: any, i: number) => {
                const idx = i + 1;
                const active = step === idx;
                const done = step > idx;
                return (
                  <button key={s.id} onClick={() => setStep(idx)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded text-[10px] uppercase tracking-widest font-bold whitespace-nowrap flex-shrink-0"
                    style={{
                      background: active ? BRAND.maroon : done ? BRAND.maroon + "30" : "transparent",
                      color: active ? BRAND.cream : done ? BRAND.gold : "#5A6878",
                      border: `1px solid ${active ? BRAND.gold : done ? BRAND.gold + "40" : "transparent"}`
                    }}>
                    {done && <Check size={10} />}
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {restored && (
        <div className="fixed top-20 right-4 z-40 px-4 py-2 rounded shadow-lg text-xs uppercase tracking-widest font-bold"
          style={{ background: BRAND.gold, color: BRAND.navy }}>
          ✓ Progress restored
        </div>
      )}

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-8 py-8">
        {step === 0 && <StepWelcome next={next} startInterview={() => setInterviewOpen(true)} />}
        {step === 1 && <StepPersonal data={data} set={set} />}
        {step === 2 && <StepLicense data={data} set={set} />}
        {step === 3 && <StepRecord data={data} set={set} />}
        {step === 4 && <StepEmployment data={data} set={set} />}
        {step === 5 && <StepDA data={data} set={set} />}
        {step === 6 && <StepDocs data={data} set={set} files={files} setFiles={setFiles} />}
        {step === 7 && <StepAuth data={data} set={set} signature={signature} setSignature={setSignature} />}
        {step === 8 && <StepReview data={data} files={files} signature={signature} signatureValid={signatureValid} allAuthsChecked={allAuthsChecked} completionScore={completionScore} />}
        {step === 9 && <StepDone data={data} downloadJson={downloadJson} submitResult={submitResult} />}

        {submitError && step !== 9 && (
          <div className="mt-4 p-4 rounded-lg" style={{ background: BRAND.maroon + "30", border: `1px solid ${BRAND.maroonLight}` }}>
            <div className="flex items-start gap-2">
              <AlertCircle size={16} style={{ color: BRAND.maroonLight, flexShrink: 0, marginTop: 2 }} />
              <div>
                <div className="text-xs uppercase tracking-[0.2em] font-bold mb-1" style={{ color: BRAND.maroonLight }}>Submission Error</div>
                <div className="text-sm" style={{ color: BRAND.cream }}>{submitError}</div>
              </div>
            </div>
          </div>
        )}

        {step > 0 && step < STEPS.length - 1 && (
          <div className="flex items-center justify-between mt-8 pt-6" style={{ borderTop: `1px solid ${BRAND.gold}20` }}>
            <button onClick={prev} className="flex items-center gap-2 px-5 py-2.5 rounded text-xs uppercase tracking-[0.2em] font-bold"
              style={{ color: BRAND.gold, border: `1px solid ${BRAND.gold}40`, fontFamily: "Oswald, sans-serif" }}>
              <ChevronLeft size={14} /> Back
            </button>
            <div className="text-xs" style={{ color: "#5A6878" }}>Step {step} of {STEPS.length - 2}</div>
            {step === STEPS.length - 2 ? (
              <button onClick={submit} disabled={!signatureValid || !allAuthsChecked || submitting}
                className="flex items-center gap-2 px-6 py-2.5 rounded text-xs uppercase tracking-[0.2em] font-bold disabled:opacity-30"
                style={{ background: BRAND.gold, color: BRAND.navy, fontFamily: "Oswald, sans-serif" }}>
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting...</> : <>Submit Application <Check size={14} /></>}
              </button>
            ) : (
              <button onClick={next} className="flex items-center gap-2 px-5 py-2.5 rounded text-xs uppercase tracking-[0.2em] font-bold"
                style={{ background: BRAND.maroon, color: BRAND.cream, fontFamily: "Oswald, sans-serif" }}>
                Continue <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="relative z-10 mt-12 py-6 border-t" style={{ borderColor: BRAND.gold + "15" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-8 flex flex-wrap items-center justify-between gap-4 text-xs" style={{ color: "#5A6878" }}>
          <div className="flex items-center gap-4 flex-wrap">
            <span style={{ color: BRAND.gold, fontFamily: "Oswald, sans-serif", letterSpacing: "0.2em" }}>GO BIG · GO SQUARE</span>
            <span>·</span>
            <span className="flex items-center gap-1.5"><Phone size={11} /> (773) 747-8436</span>
            <span className="flex items-center gap-1.5"><Mail size={11} /> dispatch@gosquare.net</span>
            <span className="flex items-center gap-1.5"><MapPin size={11} /> Naperville, IL</span>
          </div>
          <div>FMCSA Compliant · 49 CFR Parts 382, 383, 391</div>
        </div>
      </footer>

      <AIAssistant open={aiOpen} onClose={() => setAiOpen(false)}
        formData={data} setFormData={setData} currentStep={step} stepName={stepName} />

      <InterviewMode
        open={interviewOpen}
        onClose={() => setInterviewOpen(false)}
        data={data}
        setData={setData}
        onComplete={() => { setInterviewOpen(false); setStep(6); }}
      />

      {!aiOpen && step > 0 && (
        <button onClick={() => setAiOpen(true)} className="fixed bottom-6 right-6 z-40 p-4 rounded-full shadow-2xl"
          style={{ background: BRAND.maroon, border: `2px solid ${BRAND.gold}` }}>
          <Sparkles size={20} style={{ color: BRAND.gold }} />
        </button>
      )}
    </div>
  );
}
