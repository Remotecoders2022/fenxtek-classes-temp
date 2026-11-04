/* ============================================================
   FENXTEK — CMS defaults
   Used by the admin CRM "Load starter content" button and as a
   reference for the RTDB shape.
   ============================================================ */

export const defaultContent = {
  heroLead:
    "Exam-accurate dictations from 50–160 WPM, typing in Mangal, KrutiDev and Remington Gail, and structured preparation for SSC, UPSSSC, AHC and 50+ central & state patterns.",
  price: "549",
  students: 3000,
  dictations: 500,
  patterns: 50,
  phone: "+91 73090 82749",
  email: "fenxtekshorthandclasses20@gmail.com",
  telegram: "@fenxtekshorthand_classes",
  instagram: "@fenxtek_shorthand_classes",
  announcement: "Admissions open for the 2026 batches — book a free demo dictation this week.",
  directorName: "Mohd. Kaif",
  directorMessage:
    "Master Shorthand & Typing — Build Your Future. Our goal is simple: give every aspirant the right guidance, structured daily practice and personal attention needed to turn effort into a successful career."
};

export const defaultBatches = [
  { title: "SSC Stenographer Grade C & D", tag: "Central", order: 1 },
  { title: "UP Police SI Steno", tag: "State", order: 2 },
  { title: "AHC Stenographer", tag: "High Court", order: 3 },
  { title: "SGPGI Stenographer", tag: "State", order: 4 },
  { title: "UPSSSC Stenographer", tag: "State", order: 5 },
  { title: "UPPCL (Steno-Camp Assistant)", tag: "UPPCL", order: 6 },
  { title: "UPPCL APS", tag: "UPPCL", order: 7 },
  { title: "UPPSC APS", tag: "UPPSC", order: 8 }
];

export const defaultFees = [
  { label: "AHC RO / ARO Typing", note: "Special course", price: "150", was: "300", order: 1 },
  { label: "Allahabad HC APS", note: "Special course", price: "333", was: "500", order: 2 },
  { label: "Daily Editorial Hindi Dictations", note: "Membership · special", price: "225", was: "350", order: 3 },
  { label: "Ramdhari Gupta · Khand 1", note: "Membership · special", price: "200", was: "300", order: 4 },
  { label: "Ramdhari Gupta · Khand 2", note: "Membership · special", price: "250", was: "500", order: 5 },
  { label: "SSC Steno Test Hindi", note: "Exam prep", price: "350", was: "500", order: 6 },
  { label: "UPSSSC English Typing", note: "Exam prep", price: "125", was: "300", order: 7 },
  { label: "UPSSSC Steno Test", note: "Exam prep", price: "350", was: "500", order: 8 }
];

export const defaultFaqs = [
  {
    q: "How long does it take to learn Hindi shorthand?",
    a: "With 1–2 hours of daily practice, most students reach 80 WPM in 2–3 months and 100+ WPM in 6–12 months.",
    order: 1
  },
  {
    q: "What speed and time is required for SSC Stenographer?",
    a: "Grade C & D requires 100 WPM Hindi dictation (10 minutes) followed by 60 minutes of transcription on a computer.",
    order: 2
  },
  {
    q: "What is the transcription time for UPSSSC Steno?",
    a: "The UPSSSC skill test allows 30 minutes. Our platform can be set to exactly this time for accurate preparation.",
    order: 3
  },
  {
    q: "How much time is given in the AHC APS Steno exam?",
    a: "60 minutes to transcribe 400 words, with a 5% error formula — which our platform calculates automatically.",
    order: 4
  },
  {
    q: "What is the difference between Mangal and KrutiDev?",
    a: "Mangal is Unicode — the standard for most government exams. KrutiDev is the legacy font still used in some AHC patterns. We support both, plus Remington Gail.",
    order: 5
  },
  {
    q: "What is included in the membership?",
    a: "Unlimited access to all dictation courses, typing software, 400 to 1000 word passages, mock tests and progress tracking — from ₹549.",
    order: 6
  }
];

export const defaultTestimonials = [
  {
    quote:
      "Sixty to a hundred WPM in three months. Cleared SSC Steno in my first attempt — the audio is exactly like the exam hall.",
    name: "Ravi Kumar",
    exam: "SSC Steno · UP",
    badge: "Cleared",
    order: 1
  },
  {
    quote:
      "The 5% error formula is calculated automatically. I haven't found that feature anywhere else — cleared AHC APS first try.",
    name: "Priya Sharma",
    exam: "AHC APS · Allahabad",
    badge: "Cleared",
    order: 2
  },
  {
    quote:
      "Manual transcription time makes it perfect for UPSSSC prep. Incredible value for ₹549 — nothing else comes close.",
    name: "Amit Verma",
    exam: "UPSSSC Steno · Lucknow",
    badge: "Cleared",
    order: 3
  }
];
