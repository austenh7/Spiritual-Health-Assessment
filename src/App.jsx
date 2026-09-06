import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient.js";

// Standalone-app storage shim. The original build (inside Claude.ai) used
// window.storage, a Claude-artifact-only API. Outside that sandbox, plain
// browser localStorage works fine and needs no special handling — this
// shim just keeps the same get/set/delete call shape so nothing else in
// the file had to change.
const storage = {
  async get(key) {
    const value = localStorage.getItem(key);
    return value === null ? null : { key, value };
  },
  async set(key, value) {
    localStorage.setItem(key, value);
    return { key, value };
  },
  async delete(key) {
    localStorage.removeItem(key);
    return { key, deleted: true };
  },
};

/* ============================================================
   THE GARDEN — SPIRITUAL HEALTH SNAPSHOT (v6)
   Assess -> Snapshot (bars) -> Notice -> Choose Focus -> Formation -> Practice -> Trellis

   v6 changes only (30 questions, 15 dimensions, scoring, Trellis
   flow, brand fonts untouched):
   - Radial Growth Map REPLACED with editorial horizontal growth bars,
     grouped by section, individual dimension bars always visible
   - New "A few things stand out" personalized summary before the chart
   - Growth Edges gets an explicit definition + "not a failure" line
   - Reflection 3 copy updated ("up to three... you don't need to be certain")
   - 5-tier focus recommendation priority (self-selected+low > self-
     selected+imbalance > imbalance > low > self-selected-healthy)
   - New Formation step after choosing a focus: a per-dimension,
     non-scored obstacle picker that surfaces Cultivate / Prune /
     Repair / Receive framing before showing practices
   ============================================================ */

const COLORS = { ink: "#26352A", cream: "#F3EFE4", green: "#687D62", cocoa: "#3B2722", sky: "#83AEC1", yellow: "#F2C94C" };
const STORAGE_KEY = "spiritual-health-snapshot:session-v6";

/* ============================================================
   2. CONFIG
   ============================================================ */

const SECTION_META = {
  roots: { label: "Roots", verseTag: "PSALM 1", intro: "Like a tree planted by streams of water. A few questions about what's anchoring your life to Jesus.", bg: COLORS.cocoa, text: COLORS.cream, onDark: true },
  rhythms: { label: "Rhythms", verseTag: "JEREMIAH 17", intro: "How we arrange our lives so our roots can deepen and we can remain with Jesus.", bg: COLORS.green, text: COLORS.cream, onDark: true },
  reach: { label: "Reach", verseTag: "ISAIAH 61:3", intro: "Bearing fruit and providing shade for others.", bg: COLORS.sky, text: COLORS.cream, onDark: true },
};
const SECTION_BAR_COLOR = { roots: COLORS.cocoa, rhythms: COLORS.green, reach: COLORS.sky };

const DIMENSIONS = {
  christ: { label: "Christ", section: "roots", items: ["C1", "C2"] },
  word: { label: "Word", section: "roots", items: ["W1", "W2"] },
  community: { label: "Community", section: "roots", items: ["CM1", "CM2"] },
  feasting: { label: "Feasting", section: "rhythms", pairId: "feastingFasting", items: ["FE1", "FE2"] },
  fasting: { label: "Fasting", section: "rhythms", pairId: "feastingFasting", items: ["FA1", "FA2"] },
  rest: { label: "Rest", section: "rhythms", pairId: "restWork", items: ["RE1", "RE2"] },
  work: { label: "Work", section: "rhythms", pairId: "restWork", items: ["WK1", "WK2"] },
  worship: { label: "Worship", section: "rhythms", pairId: "worshipJustice", items: ["WO1", "WO2"] },
  justice: { label: "Justice", section: "rhythms", pairId: "worshipJustice", items: ["JU1", "JU2"] },
  prayer: { label: "Prayer", section: "rhythms", pairId: "prayerService", items: ["PR1", "PR2"] },
  service: { label: "Service", section: "rhythms", pairId: "prayerService", items: ["SE1", "SE2"] },
  contentment: { label: "Contentment", section: "rhythms", pairId: "contentmentGenerosity", items: ["CO1", "CO2"] },
  generosity: { label: "Generosity", section: "rhythms", pairId: "contentmentGenerosity", items: ["GE1", "GE2"] },
  shade: { label: "Shade", section: "reach", items: ["SH1", "SH2"] },
  fruit: { label: "Fruit", section: "reach", items: ["FR1", "FR2"] },
};
const DIMENSION_ORDER = Object.keys(DIMENSIONS);
const PAIR_META = {
  feastingFasting: { label: "Feasting + Fasting", sides: ["feasting", "fasting"] },
  restWork: { label: "Rest + Work", sides: ["rest", "work"] },
  worshipJustice: { label: "Worship + Justice", sides: ["worship", "justice"] },
  prayerService: { label: "Prayer + Service", sides: ["prayer", "service"] },
  contentmentGenerosity: { label: "Contentment + Generosity", sides: ["contentment", "generosity"] },
};
const PAIR_ORDER = Object.keys(PAIR_META);

const LABEL_THRESHOLDS = [
  { min: 4.25, label: "Flourishing" }, { min: 3.25, label: "Growing" },
  { min: 2.75, label: "Taking Root" }, { min: 1.75, label: "Beginning" }, { min: 0, label: "Needs Cultivation" },
];
const IMBALANCE_THRESHOLD = 2.0;
const GROWTH_CUTOFF = 3.25;

const QUESTIONS = [
  { id: "C1", dimension: "christ", section: "roots", text: "My sense of security and identity is increasingly rooted in belonging to Jesus rather than in my performance, success, or other people's approval." },
  { id: "W1", dimension: "word", section: "roots", text: "I regularly immerse myself in Scripture — not only to gain information, but to be formed by it." },
  { id: "CM1", dimension: "community", section: "roots", text: "I remain meaningfully connected to Christian community beyond simply attending a worship service." },
  { id: "W2", dimension: "word", section: "roots", text: "Scripture is increasingly shaping the way I think, make decisions, and respond to everyday life." },
  { id: "C2", dimension: "christ", section: "roots", text: "When I sin, fail, or fall short, I tend to move toward Jesus in honest repentance and trust rather than hiding or trying to prove myself." },
  { id: "CM2", dimension: "community", section: "roots", text: "There are trusted followers of Jesus with whom I can honestly confess sin, struggle, and weakness." },
  { id: "RE1", dimension: "rest", section: "rhythms", text: "I regularly stop working and producing long enough to rest, worship, and trust that the world can continue without me." },
  { id: "PR1", dimension: "prayer", section: "rhythms", text: "I intentionally withdraw from noise and activity to be alone with God." },
  { id: "GE1", dimension: "generosity", section: "rhythms", text: "Giving my time, money, possessions, and attention away for the good of others is becoming a normal part of my life." },
  { id: "FA1", dimension: "fasting", section: "rhythms", text: "I intentionally practice fasting or other forms of abstinence that help loosen the grip of my desires and redirect my attention toward God." },
  { id: "WK1", dimension: "work", section: "rhythms", text: "I approach my work and responsibilities as something entrusted to me by God, and I seek to do them with faithfulness and purpose." },
  { id: "JU1", dimension: "justice", section: "rhythms", text: "I notice people who are overlooked, vulnerable, or in need and make room in my life to respond with mercy and action." },
  { id: "FE1", dimension: "feasting", section: "rhythms", text: "I intentionally receive and enjoy God's good gifts with gratitude, celebration, and presence." },
  { id: "SE1", dimension: "service", section: "rhythms", text: "I make regular space in my life to use my time, energy, or gifts for the good of others." },
  { id: "CO1", dimension: "contentment", section: "rhythms", text: "I am learning to receive what I have with gratitude rather than being controlled by comparison, accumulation, or the feeling that I always need more." },
  { id: "WO1", dimension: "worship", section: "rhythms", text: "I increasingly see my everyday life — my work, relationships, choices, and resources — as an opportunity to worship and honor God." },
  { id: "FA2", dimension: "fasting", section: "rhythms", text: "I am increasingly able to say no to appetites and desires rather than being controlled by them." },
  { id: "JU2", dimension: "justice", section: "rhythms", text: "When I become aware of hardship or injustice, I often take some concrete step with my time, money, attention, or advocacy." },
  { id: "FE2", dimension: "feasting", section: "rhythms", text: "I can genuinely enjoy a good gift from God without guilt or the need to immediately get back to being productive." },
  { id: "WK2", dimension: "work", section: "rhythms", text: "I bring the same care and integrity to work no one is watching as I do to work that will be noticed." },
  { id: "SE2", dimension: "service", section: "rhythms", text: "I am willing to serve in ways that may be unseen or receive little recognition." },
  { id: "CO2", dimension: "contentment", section: "rhythms", text: "I can genuinely celebrate someone else's blessing — a new house, a promotion, an opportunity — without it stirring comparison or envy in me." },
  { id: "PR2", dimension: "prayer", section: "rhythms", text: "Throughout ordinary moments of my day, I increasingly find myself aware of and talking with God." },
  { id: "RE2", dimension: "rest", section: "rhythms", text: "Those who know me best would say I am becoming less hurried and more present." },
  { id: "GE2", dimension: "generosity", section: "rhythms", text: "Giving away money, time, or possessions is something I plan for in advance, not just something I do when I happen to feel moved." },
  { id: "WO2", dimension: "worship", section: "rhythms", text: "I look for specific, ordinary moments in an average day to consciously turn my attention toward God in gratitude or praise." },
  { id: "SH1", dimension: "shade", section: "reach", text: "I regularly make room in my life and around my table for neighbors, coworkers, or people beyond my closest circle." },
  { id: "FR1", dimension: "fruit", section: "reach", text: "I look for natural opportunities to talk about Jesus and what he is doing in my life with people who do not yet follow him." },
  { id: "SH2", dimension: "shade", section: "reach", text: "I intentionally look for ways to contribute to the flourishing of my neighborhood, workplace, or community." },
  { id: "FR2", dimension: "fruit", section: "reach", text: "There is at least one person I am intentionally encouraging or helping take steps toward Jesus or greater maturity in him." },
];
let _qc = 0;
QUESTIONS.forEach((q) => { q.globalNumber = ++_qc; });
["roots", "rhythms", "reach"].forEach((s) => {
  const list = QUESTIONS.filter((q) => q.section === s);
  list.forEach((q, i) => { q.sectionPosition = i + 1; q.sectionTotal = list.length; });
});
const TOTAL_QUESTIONS = QUESTIONS.length;

const CONTEXT_OPTIONS = [
  "I'm exploring Jesus / not sure what I believe", "I recently began following Jesus",
  "I've followed Jesus for a while but still feel like I'm learning the basics",
  "I've followed Jesus for several years", "I've followed Jesus for many years and regularly help others grow",
  "I'm not sure how I would describe where I am",
];
const REFLECTION3_OPTIONS = DIMENSION_ORDER.map((id) => ({ label: DIMENSIONS[id].label, dimension: id }));
const NOT_SURE_LABEL = "I'm not sure yet";
REFLECTION3_OPTIONS.push({ label: NOT_SURE_LABEL, dimension: null });

const DESCRIPTORS = {
  christ: "the sense that your identity is secure in Jesus rather than in performance or approval.",
  word: "letting Scripture actually shape how you think and live, not just informing you.",
  community: "being known, confessing struggle honestly, and staying connected beyond a Sunday gathering.",
  feasting: "receiving and celebrating God's good gifts without guilt.",
  fasting: "practicing restraint that loosens the grip of your desires.",
  rest: "stopping long enough to trust that the world continues without you.",
  work: "doing your work as something entrusted to you by God, not as your identity.",
  worship: "seeing ordinary life — work, relationships, resources — as worship.",
  justice: "noticing need and responding with concrete mercy and action.",
  prayer: "unhurried attention to God, both set-apart and throughout the day.",
  service: "using your time and gifts for others, even unseen.",
  contentment: "receiving what you have without being driven by comparison.",
  generosity: "giving your time, money, and attention away as a normal part of life.",
  shade: "making room for neighbors and contributing to the flourishing of your actual place.",
  fruit: "witnessing to, and investing in, someone else's growth toward Jesus.",
};

const VISION = {
  christ: { story: "Your worth is earned through performance and approval.", jesus: "You are already secure and loved — none of that has to be earned." },
  word: { story: "Truth is whatever feels right to you in the moment.", jesus: "Scripture forms a truer picture of reality than your feelings alone can give you." },
  community: { story: "You can grow spiritually on your own, privately.", jesus: "You are formed in the context of being known, not in isolation." },
  feasting: { story: "Enjoying good things is indulgent, or something to feel guilty about.", jesus: "Good gifts are meant to be received with gratitude, not guilt." },
  fasting: { story: "Every appetite deserves to be satisfied immediately.", jesus: "You can notice a desire without being ruled by it." },
  rest: { story: "Your value grows with your productivity.", jesus: "You can work faithfully and still stop, because your life and the world are held by God." },
  work: { story: "What you accomplish is who you are.", jesus: "Your work is something entrusted to you, not the source of your worth." },
  worship: { story: "Ordinary life is separate from spiritual life.", jesus: "All of ordinary life — work, meals, rest — can become worship." },
  justice: { story: "Someone else's hardship isn't really your responsibility.", jesus: "Loving your neighbor means responding with real, concrete action." },
  prayer: { story: "Being busy and productive matters more than being present to God.", jesus: "Unhurried attention to God isn't wasted time — it's the root everything else grows from." },
  service: { story: "What matters is what gets noticed and credited to you.", jesus: "Serving in ways no one sees isn't wasted — it's how love actually looks." },
  contentment: { story: "You always need a little more to finally be satisfied.", jesus: "You can receive what you have right now with genuine gratitude." },
  generosity: { story: "What's yours is yours to keep and protect.", jesus: "Everything you have was given to you to give away." },
  shade: { story: "Your neighbors are strangers who aren't really your concern.", jesus: "You're placed exactly where you are to seek the flourishing of the people around you." },
  fruit: { story: "Talking about faith is awkward and best avoided.", jesus: "Your life and your words are both meant to point people toward him." },
};

const IMBALANCE_COPY = {
  "feastingFasting:feasting": { title: "Fasting may be worth paying attention to.", body: "Receiving God's good gifts seems to come naturally to you. Intentional fasting may help ensure good desires don't quietly become controlling ones." },
  "feastingFasting:fasting": { title: "Feasting may be worth paying attention to.", body: "Discipline and restraint seem to come naturally to you. Practicing gratitude and receiving God's good gifts without guilt may be worth exploring." },
  "restWork:rest": { title: "Work may be worth paying attention to.", body: "Stopping and receiving rest seem to come naturally to you. Flourishing also includes faithfully stewarding what God has entrusted to you." },
  "restWork:work": { title: "Rest may be worth paying attention to.", body: "Your Work score is noticeably stronger than your Rest score. That doesn't make work a problem — it may simply mean learning to stop could become an important act of trust in this season." },
  "worshipJustice:worship": { title: "Justice may be worth paying attention to.", body: "Your devotion to God is evident. There may be room to let that devotion move outward into mercy and concern for the vulnerable." },
  "worshipJustice:justice": { title: "Worship may be worth paying attention to.", body: "Your concern for brokenness is significant. Make sure that action is continually replenished by attention to God rather than carried only by your own strength." },
  "prayerService:prayer": { title: "Service may be worth paying attention to.", body: "Your inner life with God appears meaningful. Jesus also forms us as we give ourselves away — consider one simple, consistent way to turn prayer outward into service." },
  "prayerService:service": { title: "Prayer may be worth paying attention to.", body: "You appear highly engaged in serving others, while unhurried time with Jesus is much less established. The invitation may not be to do more, but to let service increasingly flow from communion rather than exhaustion." },
  "contentmentGenerosity:contentment": { title: "Generosity may be worth paying attention to.", body: "You seem at peace with what you have. Consider what it would look like to give more of it away." },
  "contentmentGenerosity:generosity": { title: "Contentment may be worth paying attention to.", body: "You give freely — it may still be worth noticing whether comparison, scarcity, or the feeling that you need more has any grip underneath that generosity." },
};

// ---- Formation step: per-dimension, unscored obstacle picker ---------
// lens: cultivate | prune | repair | receive — informs the Choose-a-Practice framing.
const FORMATION_QUESTIONS = {
  christ: [
    { label: "I'm not sure who to turn to when I fail.", lens: "cultivate" },
    { label: "Shame makes me want to hide instead of come close.", lens: "repair" },
    { label: "I'm running on empty and don't have margin for this right now.", lens: "receive" },
    { label: "Old patterns of proving myself are hard to let go of.", lens: "prune" },
    { label: "I'm actually doing okay here — I just want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  word: [
    { label: "I don't know where to start or what to read.", lens: "cultivate" },
    { label: "My schedule doesn't have room for it right now.", lens: "prune" },
    { label: "I've tried before and it hasn't stuck.", lens: "cultivate" },
    { label: "It feels like information, not formation.", lens: "cultivate" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  community: [
    { label: "My schedule is too full.", lens: "prune" },
    { label: "I have people around me, but few people really know me.", lens: "repair" },
    { label: "Vulnerability is difficult for me.", lens: "repair" },
    { label: "I've been hurt and find it hard to trust people.", lens: "repair" },
    { label: "I tend to spend my free time alone.", lens: "cultivate" },
    { label: "I don't really know where to find community.", lens: "cultivate" },
    { label: "I'm actually doing well here; I simply want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  feasting: [
    { label: "I feel guilty slowing down to enjoy things.", lens: "cultivate" },
    { label: "I'm too busy to make space for celebration.", lens: "prune" },
    { label: "I don't really know what this would look like for me.", lens: "cultivate" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  fasting: [
    { label: "The idea of going without something makes me anxious.", lens: "cultivate" },
    { label: "I've never really tried it.", lens: "cultivate" },
    { label: "My appetite for something specific feels hard to say no to.", lens: "prune" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  rest: [
    { label: "My schedule is too full to stop.", lens: "prune" },
    { label: "I feel guilty when I'm not being productive.", lens: "cultivate" },
    { label: "I'm exhausted from circumstances outside my control right now (caregiving, a hard season, etc.).", lens: "receive" },
    { label: "I don't know how to actually rest, even when I have time.", lens: "cultivate" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  work: [
    { label: "My identity feels tied to how well things go at work.", lens: "cultivate" },
    { label: "I'm burned out or overextended right now.", lens: "receive" },
    { label: "I'm not sure how to see my actual job as meaningful.", lens: "cultivate" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  worship: [
    { label: "Ordinary life feels separate from my spiritual life.", lens: "cultivate" },
    { label: "I don't know how to make this practical.", lens: "cultivate" },
    { label: "I'm too distracted to pay attention to God in the moment.", lens: "prune" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  justice: [
    { label: "I don't know where to start.", lens: "cultivate" },
    { label: "I notice needs but don't follow through.", lens: "cultivate" },
    { label: "I feel too overwhelmed by my own life to take this on right now.", lens: "receive" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  prayer: [
    { label: "Distraction makes it hard to stay focused.", lens: "prune" },
    { label: "I'm not sure how to pray beyond a list.", lens: "cultivate" },
    { label: "Hurry leaves no real space for it.", lens: "prune" },
    { label: "I'm going through a season of spiritual dryness.", lens: "receive" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  service: [
    { label: "My schedule is already full.", lens: "prune" },
    { label: "I'm not sure where I'd actually fit.", lens: "cultivate" },
    { label: "I'm running on empty and don't have capacity for this right now.", lens: "receive" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  contentment: [
    { label: "Comparison (social media, other people's lives) gets to me.", lens: "prune" },
    { label: "Shopping or acquiring things is where I go when I'm unsettled.", lens: "prune" },
    { label: "Money anxiety makes it hard to feel like I have enough.", lens: "receive" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  generosity: [
    { label: "Fear of not having enough makes it hard to give freely.", lens: "cultivate" },
    { label: "I've never really planned my giving — it's whatever's left over.", lens: "cultivate" },
    { label: "I'm in a genuinely tight season financially right now.", lens: "receive" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  shade: [
    { label: "I don't really know my neighbors.", lens: "cultivate" },
    { label: "My schedule doesn't leave room for this.", lens: "prune" },
    { label: "I'm not sure this is something I'm good at.", lens: "cultivate" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
  fruit: [
    { label: "Talking about faith feels awkward or intimidating.", lens: "cultivate" },
    { label: "I don't have anyone specific I'm currently investing in.", lens: "cultivate" },
    { label: "I'm not sure I know someone well enough yet to have this conversation.", lens: "cultivate" },
    { label: "I'm doing okay here — I want to go deeper.", lens: "cultivate" },
    { label: "Something else.", lens: "cultivate" }, { label: "I'm not sure.", lens: "cultivate" },
  ],
};

const LENS_COPY = {
  cultivate: { insight: "This looks like a good candidate for building one small, repeatable rhythm." },
  prune: { insight: "This may be less about adding something new and more about removing what's crowding it out.", cardTitle: "Protect the space", cardBody: (label) => `Identify one commitment, habit, or distraction competing with ${label}, and set it aside for a season.` },
  repair: { insight: "This may call for an honest step of repair more than a new habit.", cardTitle: "Take one honest step", cardBody: (label) => `If there's a relationship, situation, or unresolved thing connected to ${label}, prayerfully consider what a next faithful step could look like — possibly with a trusted person or your MC leader.` },
  receive: { insight: "This may be less about trying harder and more about receiving support in this season.", cardTitle: "Let someone help carry this", cardBody: () => `Talk to your MC leader, an elder, or a trusted friend about what's happening. Receiving care is itself a faithful next step.` },
};

const TIER_META = { begin: { label: "Start Here", cadence: "Daily" }, build: { label: "Build a Rhythm", cadence: "Weekly" }, deepen: { label: "Go Deeper", cadence: "Weekly" }, stretch: { label: "Stretch", cadence: "Occasionally" } };
const TIER_ORDER = ["begin", "build", "deepen", "stretch"];

const PRACTICES = {
  christ: [
    { tier: "begin", title: "Speak the gospel to yourself", description: "Before you check your phone each morning, say one sentence out loud: \"I am loved and secure because of Jesus, not because of what I accomplish today.\"", trains: "Beginning your day rooted in who Jesus says you are, not what you'll accomplish.", type: "cultivate" },
    { tier: "build", title: "Keep a short \"true things\" list", description: "Write 3–5 truths about who you are in Christ and reread them weekly, especially after a hard day.", trains: "Returning to your identity in Christ as a practiced habit, not just a feeling.", type: "cultivate" },
    { tier: "deepen", title: "Name the voice that isn't God's", description: "When you notice shame or the urge to prove yourself, pause and ask whose voice you're actually listening to.", trains: "Noticing shame or striving in the moment, and interrupting it with truth.", type: "cultivate" },
    { tier: "stretch", title: "Practice a breath prayer under pressure", description: "Choose a short phrase (\"Jesus, I belong to you\") to pray silently in moments of stress or failure until it becomes reflexive.", trains: "Letting your identity in Christ become reflexive, even under real pressure.", type: "cultivate" },
  ],
  word: [
    { tier: "begin", title: "Read one chapter, four mornings a week", description: "Pick a Gospel. No study guide required yet.", trains: "Letting Scripture become a normal part of an ordinary morning.", type: "cultivate" },
    { tier: "build", title: "Ask three questions of every passage", description: "What does this show me about God? What does this reveal about me? What would trusting Jesus look like today?", trains: "Reading Scripture to be formed by it, not just informed.", type: "cultivate" },
    { tier: "deepen", title: "Trade guilt for a fresh start", description: "If you've missed a stretch, don't try to catch up — just open to today's reading.", trains: "Returning to God's Word without needing to earn your way back first.", type: "cultivate" },
    { tier: "stretch", title: "Memorize one verse a month", description: "Choose one tied to your actual season and carry it until it's genuinely yours.", trains: "Carrying Scripture with you into moments when you can't open a Bible.", type: "cultivate" },
  ],
  community: [
    { tier: "begin", title: "Text one MC person this week", description: "Ask how they're really doing, and tell them one true thing about your own week.", trains: "Taking a first small step toward being known, not just present.", type: "cultivate" },
    { tier: "build", title: "Bring one real thing to MC each week", description: "Decide in advance on one honest sentence you'll say about how you're actually doing.", trains: "Practicing honesty as a habit rather than an occasional exception.", type: "cultivate" },
    { tier: "deepen", title: "Name what you're avoiding saying", description: "Identify the one thing you haven't told anyone yet, and ask God if this is the week.", trains: "Facing what hiding costs you, and choosing to be known instead.", type: "cultivate" },
    { tier: "stretch", title: "Ask someone to walk with you", description: "Invite a trusted person into a recurring, specific conversation about one particular struggle — not a general catch-up.", trains: "Letting your growth happen inside an actual relationship, not alone.", type: "cultivate" },
  ],
  feasting: [
    { tier: "begin", title: "Plan one celebration this week", description: "A meal, a friend, a small luxury — chosen in advance, received slowly, with thanks.", trains: "Receiving a good gift from God without rushing past it.", type: "cultivate" },
    { tier: "build", title: "Make one weekly meal a small feast", description: "Slow down, invite someone, say thanks out loud.", trains: "Practicing gratitude and celebration as a normal rhythm.", type: "cultivate" },
    { tier: "deepen", title: "Notice when you rush past good things", description: "Catch yourself in a good moment this week and stay in it 30 seconds longer than usual.", trains: "Slowing down enough to actually receive what's good.", type: "cultivate" },
    { tier: "stretch", title: "Host a Garden gathering", description: "Invite people over specifically to celebrate something — an answered prayer, a birthday, the end of a hard season.", trains: "Turning personal gratitude into shared celebration with others.", type: "cultivate" },
  ],
  fasting: [
    { tier: "begin", title: "Skip one meal this week", description: "Let the hunger prompt prayer; notice what surfaces.", trains: "Letting a small hunger become a prompt to pray.", type: "cultivate" },
    { tier: "build", title: "Fast one meal every week for a month", description: "Same meal, same day, so it becomes a rhythm.", trains: "Building a rhythm of restraint that isn't a one-time event.", type: "cultivate" },
    { tier: "deepen", title: "Fast from something other than food", description: "Name one appetite with real power over you right now (scrolling, snacking, checking your phone) and abstain for 24 hours.", trains: "Noticing that a desire can be named without being obeyed.", type: "prune" },
    { tier: "stretch", title: "Practice a longer fast with a friend", description: "Choose a day to fast alongside someone in your MC, and talk afterward about what you noticed.", trains: "Sustaining restraint long enough for it to actually loosen a desire's grip.", type: "cultivate" },
  ],
  rest: [
    { tier: "begin", title: "Stop for one evening", description: "No email, no side project, one evening this week.", trains: "Practicing the trust that the world continues without you.", type: "cultivate" },
    { tier: "build", title: "Practice a weekly Sabbath block", description: "Saturday evening through Sunday lunch, for example — stop, rest, worship, delight.", trains: "Making stopping a rhythm, not just an occasional relief.", type: "cultivate" },
    { tier: "deepen", title: "Create a shutdown ritual", description: "End your workday by writing tomorrow's priorities, closing the laptop, and releasing what's unfinished to God.", trains: "Releasing what's unfinished to God instead of carrying it into rest.", type: "cultivate" },
    { tier: "stretch", title: "Take a half-day of silence", description: "Once a month: no screens, no agenda, just being with God.", trains: "Sustaining stillness long enough to actually notice God's presence.", type: "cultivate" },
  ],
  work: [
    { tier: "begin", title: "Pray one sentence before starting work", description: "\"This is for you\" — before you open the laptop or clock in.", trains: "Offering your work to God before you measure it by results.", type: "cultivate" },
    { tier: "build", title: "Do one task with extra care this week", description: "Choose something no one will notice or grade, and do it as if for God.", trains: "Doing unseen work well because it matters to God, not an audience.", type: "cultivate" },
    { tier: "deepen", title: "Notice when achievement starts to feel like identity", description: "After a project succeeds or fails, ask: did that change how secure I feel?", trains: "Separating your worth from how a project actually turns out.", type: "cultivate" },
    { tier: "stretch", title: "Write a short \"why\" for your work", description: "One paragraph on how your actual job serves God and others. Reread it on hard days.", trains: "Anchoring your work in a purpose durable enough for hard days.", type: "cultivate" },
  ],
  worship: [
    { tier: "begin", title: "Name one ordinary thing as worship today", description: "A task — laundry, a commute, an errand — offered to God before you do it.", trains: "Recognizing an everyday task as an offering, not just a chore.", type: "cultivate" },
    { tier: "build", title: "Build a worship pause into your morning or commute", description: "A few minutes of music, gratitude, or silence before the day's demands start.", trains: "Making attention to God a regular part of an ordinary day.", type: "cultivate" },
    { tier: "deepen", title: "Notice routine vs. worship", description: "Is there something you do every day on autopilot that could become an act of attention toward God instead?", trains: "Turning autopilot moments into conscious attention toward God.", type: "cultivate" },
    { tier: "stretch", title: "Keep a short gratitude log", description: "Three lines a day for a month, naming where you saw God in ordinary moments.", trains: "Training your eyes to see God at work in ordinary moments.", type: "cultivate" },
  ],
  justice: [
    { tier: "begin", title: "Notice one need this week", description: "Someone overlooked — a coworker, a cashier, a neighbor — and do one small, concrete thing.", trains: "Paying attention to someone easy to overlook.", type: "cultivate" },
    { tier: "build", title: "Give consistently to one cause or person", description: "A recurring, specific way to give time, money, or attention, rather than waiting for a need to surface.", trains: "Turning compassion into a steady commitment, not a passing feeling.", type: "cultivate" },
    { tier: "deepen", title: "Turn a feeling into an action within 48 hours", description: "Next time you're moved by someone's hardship, act on it quickly instead of letting the feeling pass.", trains: "Closing the gap between being moved and actually doing something.", type: "cultivate" },
    { tier: "stretch", title: "Get proximate", description: "Find a recurring way to serve in Carnes Crossroads or Cane Bay that puts you in regular contact with people whose circumstances differ from yours.", trains: "Letting relationship, not distance, shape how you understand need.", type: "cultivate" },
  ],
  prayer: [
    { tier: "begin", title: "Take ten quiet minutes, five days a week", description: "No agenda beyond being with God.", trains: "Being with God with no agenda but presence.", type: "cultivate" },
    { tier: "build", title: "Anchor prayer to a time and place", description: "A chair, a walk, the drive to work — the same one, so it's easier to sustain.", trains: "Making prayer easier to sustain by attaching it to something fixed.", type: "cultivate" },
    { tier: "deepen", title: "Replace one scroll with one breath prayer", description: "Each time you reach for your phone out of boredom this week, pray a single line instead.", trains: "Interrupting a reflex with a moment of attention to God.", type: "cultivate" },
    { tier: "stretch", title: "Try a fixed-hour rhythm for a week", description: "A brief pause for prayer at set times — morning, midday, evening.", trains: "Letting prayer punctuate an entire day, not just its edges.", type: "cultivate" },
  ],
  service: [
    { tier: "begin", title: "Find one recurring place to serve", description: "MC setup, kids ministry, a neighbor's need — one consistent spot.", trains: "Using your time and gifts for someone else on a regular basis.", type: "cultivate" },
    { tier: "build", title: "Serve without announcing it", description: "Do one helpful thing this week and don't mention it to anyone.", trains: "Serving because it's needed, not because it will be noticed.", type: "cultivate" },
    { tier: "deepen", title: "Ask what you'd do if no one ever found out", description: "Let the answer shape one choice this week.", trains: "Letting an honest answer shape an actual choice.", type: "cultivate" },
    { tier: "stretch", title: "Take on a role that stretches you", description: "Say yes to something that asks more of your time or skill than what's comfortable.", trains: "Serving in a way that costs you something real.", type: "cultivate" },
  ],
  contentment: [
    { tier: "begin", title: "Write three specific gratitudes each night", description: "Not generic — name what actually happened today.", trains: "Noticing what's actually good instead of what's missing.", type: "cultivate" },
    { tier: "build", title: "Take a one-week break from browsing or shopping", description: "Notice what surfaces when you're not looking at what you could have.", trains: "Seeing what surfaces when you stop looking at what you could have.", type: "cultivate" },
    { tier: "deepen", title: "Name a comparison trigger", description: "One account, habit, or person that reliably stirs comparison — limit your exposure this week.", trains: "Limiting exposure to whatever reliably stirs up comparison in you.", type: "prune" },
    { tier: "stretch", title: "Practice a \"good enough\" day", description: "One day where you intentionally don't upgrade, optimize, or acquire anything.", trains: "Resting in what you already have, for one whole day.", type: "cultivate" },
  ],
  generosity: [
    { tier: "begin", title: "Give one specific thing away this week", description: "Money, time, or a possession, decided in advance.", trains: "Practicing generosity as a decision, not a leftover impulse.", type: "cultivate" },
    { tier: "build", title: "Set a giving plan for the month", description: "Decide ahead what you'll give and to whom.", trains: "Making giving a rhythm you plan for, not just react to.", type: "cultivate" },
    { tier: "deepen", title: "Give something that would actually cost you", description: "Notice if your giving only ever comes from surplus, and try one gift that requires a real adjustment.", trains: "Noticing whether your generosity ever comes from more than surplus.", type: "cultivate" },
    { tier: "stretch", title: "Give anonymously", description: "Find one way to give generously where the recipient won't know it came from you.", trains: "Giving without needing to be known as the giver.", type: "cultivate" },
  ],
  shade: [
    { tier: "begin", title: "Learn one neighbor's name this week", description: "If you don't know it yet, go find out.", trains: "Turning a stranger into someone you actually know.", type: "cultivate" },
    { tier: "build", title: "Host a recurring Neighboring Night", description: "Once a month, invite people from your street or workplace over for something low-key.", trains: "Making presence with neighbors a rhythm, not a one-time gesture.", type: "cultivate" },
    { tier: "deepen", title: "Notice who you've been too busy to see", description: "Name one person in your daily path you've been overlooking, and do one small thing for them.", trains: "Choosing to see someone your pace has caused you to overlook.", type: "cultivate" },
    { tier: "stretch", title: "Get involved at Carolyn Lewis", description: "Find a recurring way to serve at the school with no agenda beyond being present for the neighborhood.", trains: "Committing to a place long enough for real relationships to form.", type: "cultivate" },
  ],
  fruit: [
    { tier: "begin", title: "Tell one story about Jesus this week", description: "In a normal conversation, mention one true thing about what God is doing in your life.", trains: "Letting what God is doing in your life come up naturally in conversation.", type: "cultivate" },
    { tier: "build", title: "Meet with one person intentionally", description: "A recurring time with someone you're encouraging toward Jesus or toward maturity in him.", trains: "Investing in someone else's growth on purpose, not by accident.", type: "cultivate" },
    { tier: "deepen", title: "Ask a spiritual question instead of giving an answer", description: "Practice curiosity with someone who doesn't yet follow Jesus.", trains: "Practicing curiosity with someone instead of leading with your own answer.", type: "cultivate" },
    { tier: "stretch", title: "Invite someone into your MC", description: "Take the step of inviting a specific person, by name, into your Missional Community.", trains: "Taking the actual, specific, nameable step of an invitation.", type: "cultivate" },
  ],
};

function getPlaceholderResources(dimId) {
  const label = DIMENSIONS[dimId].label;
  return [
    { type: "Scripture", label: `A passage connected to ${label} (curated resource coming soon)` },
    { type: "Garden Guide", label: `${label} — a short Garden guide (coming soon)` },
    { type: "Community", label: `Ask your MC leader for a recommended teaching on ${label}` },
  ];
}

function buildSteps() {
  const steps = [{ type: "context", id: "context", prompt: "Which best describes where you are right now?", options: CONTEXT_OPTIONS }];
  ["roots", "rhythms", "reach"].forEach((sectionId) => {
    steps.push({ type: "transition", id: `transition-${sectionId}`, section: sectionId });
    QUESTIONS.filter((q) => q.section === sectionId).forEach((q) => {
      steps.push({ type: "likert", id: q.id, dimension: q.dimension, section: sectionId, prompt: q.text, globalNumber: q.globalNumber, sectionPosition: q.sectionPosition, sectionTotal: q.sectionTotal });
    });
  });
  steps.push({ type: "text", id: "reflection1", prompt: "Looking back over the last six months, where have you seen the most growth in your life with Jesus?" });
  steps.push({ type: "text", id: "reflection2", prompt: "Where do you currently feel most stuck, stretched, or spiritually dry?" });
  steps.push({
    type: "multi-select-text", id: "reflection3",
    prompt: "Where might Jesus be inviting your attention?",
    helper: "Based on your responses, these are a few areas that may deserve some attention in this season. Choose one or two that you sense Jesus inviting you to lean into.",
    options: REFLECTION3_OPTIONS, textLabel: "Want to say more? (optional)",
  });
  return steps;
}
const STEPS = buildSteps();

/* ============================================================
   3. PURE SCORING / LOGIC FUNCTIONS
   ============================================================ */

function average(nums) { const v = nums.filter((n) => typeof n === "number" && !Number.isNaN(n)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; }
export function getDimensionScore(dimId, answers) { return average(DIMENSIONS[dimId].items.map((i) => Number(answers[i]))); }
export function getAllDimensionScores(answers) { const s = {}; DIMENSION_ORDER.forEach((id) => (s[id] = getDimensionScore(id, answers))); return s; }
export function getLabelForScore(avg) { for (const t of LABEL_THRESHOLDS) if (avg >= t.min) return t.label; return LABEL_THRESHOLDS.at(-1).label; }
export function getImbalance(pairId, dimScores) {
  const [aId, bId] = PAIR_META[pairId].sides;
  const a = dimScores[aId], b = dimScores[bId];
  const diff = Math.abs(a - b);
  return { pairId, diff, flagged: diff >= IMBALANCE_THRESHOLD, higherSide: a === b ? null : a > b ? aId : bId, lowerSide: a === b ? null : a > b ? bId : aId };
}
export function getAllImbalances(dimScores) { return PAIR_ORDER.map((p) => getImbalance(p, dimScores)); }
export function getGrowingAreas(dimScores) { return [...DIMENSION_ORDER].sort((a, b) => dimScores[b] - dimScores[a]).slice(0, 3); }

// ---- 5-tier focus recommendation priority (v6) ------------------------
export function getFocusCandidates(dimScores, imbalances, selfSelectedDims = []) {
  const candidates = [];
  const push = (d) => { if (d && !candidates.includes(d)) candidates.push(d); };
  const flaggedLowerSides = [...imbalances].filter((im) => im.flagged).sort((a, b) => b.diff - a.diff).map((im) => im.lowerSide);
  const lowSorted = [...DIMENSION_ORDER].sort((a, b) => dimScores[a] - dimScores[b]);
  // 1. self-selected + lower-scoring
  selfSelectedDims.forEach((d) => { if (dimScores[d] < GROWTH_CUTOFF) push(d); });
  // 2. self-selected + lower side of imbalance
  selfSelectedDims.forEach((d) => { if (flaggedLowerSides.includes(d)) push(d); });
  // 3. strong rhythm imbalance (any)
  flaggedLowerSides.forEach(push);
  // 4. clearly lower-scoring dimension
  lowSorted.forEach((d) => { if (dimScores[d] < GROWTH_CUTOFF) push(d); });
  // 5. self-selected even if healthy (deepen)
  selfSelectedDims.forEach(push);
  // fallback fill
  lowSorted.forEach(push);
  return candidates.slice(0, 3);
}
export function needsGrowthFraming(candidates, dimScores) { return candidates.some((d) => dimScores[d] < GROWTH_CUTOFF); }
export function getCandidateReason(dimId, imbalances, selfSelectedDims, dimScores) {
  const isSelf = selfSelectedDims.includes(dimId);
  const isLow = dimScores[dimId] < GROWTH_CUTOFF;
  const im = imbalances.find((i) => i.flagged && i.lowerSide === dimId);
  if (isSelf && isLow) return "You sensed this deserves attention, and it's also currently one of your lower-scoring areas.";
  if (isSelf && im) return `You sensed this deserves attention, and your ${PAIR_META[im.pairId].label} pattern shows a gap worth noticing.`;
  if (im) return `Your ${PAIR_META[im.pairId].label} pattern shows a notable gap — ${DIMENSIONS[im.higherSide].label} is currently stronger.`;
  if (isLow) return "This is currently one of your lower-scoring areas.";
  if (isSelf) return "You sensed this deserves attention — even though it's already in a healthy place, this may be an invitation to go deeper.";
  return "Worth a look this season, even though nothing here is urgent.";
}
function joinWithAnd(arr) {
  if (arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")}, and ${arr.at(-1)}`;
}
export function buildStandoutSummary(dimScores, focusCandidates, selfSelectedDims) {
  const growingTop = getGrowingAreas(dimScores).slice(0, 2).map((d) => DIMENSIONS[d].label);
  let text = growingTop.length ? `You're seeing real growth in ${joinWithAnd(growingTop)}. ` : "";
  const edges = focusCandidates.slice(0, 2);
  const edgeParts = edges.map((d) => {
    const overlap = selfSelectedDims.includes(d);
    return `${DIMENSIONS[d].label} may deserve some attention${overlap ? " — something you'd already sensed an invitation toward" : ""}`;
  });
  if (edgeParts.length) text += edgeParts.join(", and ") + ".";
  return text;
}
export function getTierWindow(bandLabel) {
  const centerByBand = { "Needs Cultivation": 0, "Beginning": 0, "Taking Root": 1, "Growing": 2, "Flourishing": 2 };
  const center = centerByBand[bandLabel] ?? 1;
  const startIdx = Math.max(0, Math.min(center - 1, TIER_ORDER.length - 3));
  return TIER_ORDER.slice(startIdx, startIdx + 3);
}
export function getHiddenTier(window) { return TIER_ORDER.find((t) => !window.includes(t)); }

export function describeResumePoint(s) {
  if (s.stage === "quiz") {
    const step = STEPS[s.quizStepIndex];
    if (step && step.type === "likert") return `You were partway through the assessment — question ${step.globalNumber} of ${TOTAL_QUESTIONS}.`;
    return "You were partway through the assessment.";
  }
  if (s.stage === "trellis") return "You'd already finished — here's your Trellis.";
  return "You'd finished the assessment and were setting up your Trellis.";
}

/* ============================================================
   4. COMPONENT
   ============================================================ */

const POST_ORDER = ["snapshot", "choose-focus", "formation", "choose-practice", "add-trellis", "resources", "community", "followup", "future-self", "save-results", "trellis"];

export default function SpiritualHealthSnapshot() {
  const [stage, setStage] = useState("intro");
  const [quizStepIndex, setQuizStepIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [transitioning, setTransitioning] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const [selectDraft, setSelectDraft] = useState([]);

  const [chosenFocus, setChosenFocus] = useState(null);
  const [exploreAll, setExploreAll] = useState(false);
  const [formationAnswer, setFormationAnswer] = useState(null);
  const [showHiddenTier, setShowHiddenTier] = useState(false);
  const [showAllReflectionAreas, setShowAllReflectionAreas] = useState(false);
  const [chosenPractice, setChosenPractice] = useState(null);
  const [customPractice, setCustomPractice] = useState("");
  const [showCustomPractice, setShowCustomPractice] = useState(false);
  const [intention, setIntention] = useState("");
  const [cadence, setCadence] = useState("");
  const [communityPerson, setCommunityPerson] = useState("");
  const [futureSelfNote, setFutureSelfNote] = useState("");
  const [followUp, setFollowUp] = useState({ practiceCheckInDate: null, snapshotRetakeDate: null });

  // Supabase save-on-completion state.
  const [submissionId, setSubmissionId] = useState(null);
  const [resultsSaved, setResultsSaved] = useState(false);
  const [submitStatus, setSubmitStatus] = useState("idle"); // idle | saving | error
  const [saveError, setSaveError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pendingResume, setPendingResume] = useState(null);

  const loadedRef = useRef(false);
  const chartRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await storage.get(STORAGE_KEY);
        if (result && result.value) {
          const s = JSON.parse(result.value);
          if (s && s.stage && s.stage !== "intro") {
            // Don't jump straight back in — let the person choose Continue vs Start Fresh.
            setPendingResume(s);
          }
        }
      } catch (e) {} finally { loadedRef.current = true; }
    })();
  }, []);

  function resumeSession() {
    const s = pendingResume;
    if (!s) return;
    setStage(s.stage); setQuizStepIndex(s.quizStepIndex || 0); setAnswers(s.answers || {});
    setChosenFocus(s.chosenFocus || null); setFormationAnswer(s.formationAnswer || null);
    setChosenPractice(s.chosenPractice || null); setCustomPractice(s.customPractice || "");
    setIntention(s.intention || ""); setCadence(s.cadence || ""); setCommunityPerson(s.communityPerson || "");
    setFutureSelfNote(s.futureSelfNote || ""); setFollowUp(s.followUp || { practiceCheckInDate: null, snapshotRetakeDate: null });
    setSubmissionId(s.submissionId || null); setResultsSaved(!!s.resultsSaved);
    setFirstName(s.firstName || ""); setLastName(s.lastName || ""); setEmail(s.email || "");
    setPendingResume(null);
  }

  async function startFreshFromResume() {
    setPendingResume(null);
    try { await storage.delete(STORAGE_KEY); } catch (e) {}
  }

  useEffect(() => {
    if (!loadedRef.current || stage === "intro") return;
    (async () => {
      try {
        await storage.set(STORAGE_KEY, JSON.stringify({
          stage, quizStepIndex, answers, chosenFocus, formationAnswer, chosenPractice, customPractice,
          intention, cadence, communityPerson, futureSelfNote, followUp,
          submissionId, resultsSaved, firstName, lastName, email,
        }));
      } catch (e) {}
    })();
  }, [stage, quizStepIndex, answers, chosenFocus, formationAnswer, chosenPractice, customPractice, intention, cadence, communityPerson, futureSelfNote, followUp, submissionId, resultsSaved, firstName, lastName, email]);

  useEffect(() => {
    if (stage !== "quiz") return;
    const s = STEPS[quizStepIndex]; if (!s) return;
    if (s.type === "text") setTextDraft(answers[s.id] || "");
    else if (s.type === "multi-select-text") { const e = answers[s.id] || {}; setSelectDraft(e.selects || []); setTextDraft(e.text || ""); }
  }, [stage, quizStepIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = stage === "quiz" ? STEPS[quizStepIndex] : null;
  const totalSteps = STEPS.length;

  function advanceOrFinish() { if (quizStepIndex < totalSteps - 1) setQuizStepIndex((i) => i + 1); else setStage("snapshot"); }
  function selectLikert(v) { if (transitioning) return; setAnswers((p) => ({ ...p, [step.id]: v })); setTransitioning(true); setTimeout(() => { advanceOrFinish(); setTransitioning(false); }, 300); }
  function selectContext(v) { if (transitioning) return; setAnswers((p) => ({ ...p, context: v })); setTransitioning(true); setTimeout(() => { advanceOrFinish(); setTransitioning(false); }, 300); }
  function submitText() { setAnswers((p) => ({ ...p, [step.id]: textDraft })); advanceOrFinish(); }
  function submitMultiSelectText() { setAnswers((p) => ({ ...p, [step.id]: { selects: selectDraft, text: textDraft } })); advanceOrFinish(); }
  function toggleReflection3(label) {
    if (label === NOT_SURE_LABEL) { setSelectDraft([label]); return; }
    setSelectDraft((prev) => {
      if (prev.includes(label)) return prev.filter((l) => l !== label);
      const w = prev.filter((l) => l !== NOT_SURE_LABEL);
      return w.length >= 2 ? w : [...w, label];
    });
  }
  function goBackQuiz() { if (!transitioning && quizStepIndex > 0) setQuizStepIndex((i) => i - 1); }
  function goBackPost() { const idx = POST_ORDER.indexOf(stage); if (idx > 0) setStage(POST_ORDER[idx - 1]); }
  async function startOver() {
    setStage("intro"); setQuizStepIndex(0); setAnswers({});
    setChosenFocus(null); setExploreAll(false); setFormationAnswer(null); setShowHiddenTier(false);
    setChosenPractice(null); setCustomPractice(""); setShowCustomPractice(false);
    setIntention(""); setCadence(""); setCommunityPerson(""); setFutureSelfNote("");
    setFollowUp({ practiceCheckInDate: null, snapshotRetakeDate: null });
    setSubmissionId(null); setResultsSaved(false); setSubmitStatus("idle"); setSaveError("");
    setFirstName(""); setLastName(""); setEmail("");
    try { await storage.delete(STORAGE_KEY); } catch (e) {}
  }
  function formatDate(iso) { return iso ? new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : ""; }
  function goFormation() { setFormationAnswer(null); setStage("formation"); }
  function proceedToSaveResults() {
    if (!submissionId) setSubmissionId(crypto.randomUUID());
    setStage("save-results");
  }
  async function saveResultsToSupabase() {
    if (resultsSaved) return; // already saved this session — never insert twice
    setSubmitStatus("saving");
    setSaveError("");
    if (!supabase) {
      setSubmitStatus("error");
      setSaveError("Saving isn't connected yet.");
      return;
    }
    const payload = {
      submission_id: submissionId,
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      email: email.trim() || null,
      christ_score: dimScores.christ, word_score: dimScores.word, community_score: dimScores.community,
      feasting_score: dimScores.feasting, fasting_score: dimScores.fasting,
      rest_score: dimScores.rest, work_score: dimScores.work,
      worship_score: dimScores.worship, justice_score: dimScores.justice,
      prayer_score: dimScores.prayer, service_score: dimScores.service,
      contentment_score: dimScores.contentment, generosity_score: dimScores.generosity,
      shade_score: dimScores.shade, fruit_score: dimScores.fruit,
      dimension_statuses: Object.fromEntries(DIMENSION_ORDER.map((d) => [d, getLabelForScore(dimScores[d])])),
      reflection_areas: selfSelectedDims.map((d) => DIMENSIONS[d].label),
      chosen_focus: chosenFocus ? DIMENSIONS[chosenFocus].label : null,
      chosen_practice_title: chosenPractice ? chosenPractice.title : null,
      chosen_practice_description: chosenPractice ? chosenPractice.description || null : null,
    };
    const { error } = await supabase.from("assessment_submissions").insert([payload]);
    if (error) {
      setSubmitStatus("error");
      setSaveError("Your results didn't save — you can try again, or continue without saving.");
    } else {
      setResultsSaved(true);
      setSubmitStatus("idle");
    }
  }
  function goAddTrellis() {
    setIntention(chosenPractice && chosenPractice.description ? chosenPractice.description : "");
    setCadence(chosenPractice && chosenPractice.tier ? TIER_META[chosenPractice.tier].cadence : "");
    setStage("add-trellis");
  }
  function confirmFollowUp() {
    const now = new Date(); const c = new Date(now); c.setDate(c.getDate() + 30); const r = new Date(now); r.setMonth(r.getMonth() + 6);
    setFollowUp({ practiceCheckInDate: c.toISOString(), snapshotRetakeDate: r.toISOString() });
    setStage("future-self");
  }

  let dimScores = null, imbalances = null, growingAreas = null, focusCandidates = null, selfSelectedDims = [], showDeepenFraming = false, tierWindow = null, hiddenTier = null, standout = "";
  if (POST_ORDER.includes(stage)) {
    dimScores = getAllDimensionScores(answers);
    imbalances = getAllImbalances(dimScores);
    growingAreas = getGrowingAreas(dimScores);
    const r3 = answers.reflection3 || {};
    selfSelectedDims = (r3.selects || []).map((l) => { const o = REFLECTION3_OPTIONS.find((x) => x.label === l); return o ? o.dimension : null; }).filter(Boolean);
    focusCandidates = getFocusCandidates(dimScores, imbalances, selfSelectedDims);
    showDeepenFraming = !needsGrowthFraming(focusCandidates, dimScores);
    standout = buildStandoutSummary(dimScores, focusCandidates, selfSelectedDims);
    if (chosenFocus) { tierWindow = getTierWindow(getLabelForScore(dimScores[chosenFocus])); hiddenTier = getHiddenTier(tierWindow); }
  }

  const sectionMeta = step ? SECTION_META[step.section] : null;
  const bgColor = step && (step.type === "likert" || step.type === "transition") ? sectionMeta.bg : COLORS.cream;
  const textColorOnBg = step && (step.type === "likert" || step.type === "transition") ? sectionMeta.text : COLORS.ink;
  const onDark = step && (step.type === "likert" || step.type === "transition") ? sectionMeta.onDark : true;
  const lens = formationAnswer ? formationAnswer.lens : "cultivate";

  return (
    <div className={`snap-app${stage === "intro" ? " snap-app--intro" : ""}`} style={{ "--dyn-bg": bgColor, "--dyn-text": textColorOnBg }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;1,600&family=EB+Garamond:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        .snap-app { --font-title:'Fraunces',Georgia,serif; --font-subtitle:'EB Garamond',Georgia,serif; --font-body:'Inter',-apple-system,sans-serif; font-family:var(--font-body); color:${COLORS.ink}; background:var(--dyn-bg,${COLORS.cream}); min-height:100vh; display:flex; flex-direction:column; align-items:center; padding:48px 22px 90px; box-sizing:border-box; transition:background .2s ease; }
        .snap-app * { box-sizing:border-box; }

        /* --- Cross-browser button reset (iOS Safari, in-app/Church Center webviews) ---
           iOS Safari applies its own default tap/focus chrome to button elements —
           a blue tap-highlight overlay and sometimes a blue focus ring — that ignores
           whatever background/border a class defines. Resetting the bare button
           element first, then letting each specific class (.scale-target, .choice-row,
           .option-card, .snap-btn) define its own explicit colors, removes that
           regardless of which browser or embedded webview is rendering it. */
        button {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          background: transparent;
          border: none;
          margin: 0;
          font: inherit;
          color: inherit;
          outline: none;
          -webkit-tap-highlight-color: transparent;
        }
        button:focus { outline: none; }
        button:active { outline: none; }
        /* Accessible keyboard-navigation focus ring — Garden Green, never browser blue. */
        button:focus-visible {
          outline: 2px solid ${COLORS.green};
          outline-offset: 2px;
        }
        /* Intro: vertically centered on desktop within most of the viewport, natural
           top-down flow preserved on mobile. Reading width stays governed by .snap-card. */
        @media (min-width:768px){ .snap-app.snap-app--intro { justify-content:center; } }
        .snap-card { width:100%; max-width:600px; color:var(--dyn-text,${COLORS.ink}); }
        .eyebrow { font-family:var(--font-subtitle); font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:${COLORS.green}; margin-bottom:10px; }
        h1.snap-title { font-family:var(--font-title); font-weight:600; letter-spacing:-.01em; font-size:clamp(24px,4.6vw,34px); line-height:1.3; margin:0 0 18px; }
        h2.snap-h2 { font-family:var(--font-title); font-weight:600; font-size:clamp(19px,3vw,22px); line-height:1.35; margin:0 0 8px; }
        p.snap-body { font-family:var(--font-body); font-size:16px; line-height:1.65; margin:0 0 16px; }
        button.snap-btn { font-family:var(--font-body); font-size:14px; letter-spacing:.04em; padding:13px 28px; border-radius:999px; border:1px solid var(--dyn-text, ${COLORS.ink}); background:transparent; color:var(--dyn-text, ${COLORS.ink}); -webkit-text-fill-color:var(--dyn-text, ${COLORS.ink}); -webkit-tap-highlight-color:transparent; cursor:pointer; }
        button.snap-btn.primary.on-cream { background:${COLORS.ink}; } button.snap-btn.primary.on-cream span { color:${COLORS.cream}; }
        button.snap-btn:disabled { opacity:.35; cursor:not-allowed; }
        .btn-row { display:flex; gap:12px; margin-top:28px; flex-wrap:wrap; }
        .back-link { font-family:var(--font-body); font-size:13px; color:var(--dyn-text, ${COLORS.ink}); -webkit-text-fill-color:var(--dyn-text, ${COLORS.ink}); opacity:.65; background:none; border:none; padding:0; cursor:pointer; margin-bottom:18px; -webkit-tap-highlight-color:transparent; }
        .back-link:disabled { opacity:.25; cursor:default; }
        .progress-track { width:100%; height:4px; background:rgba(0,0,0,.15); border-radius:2px; margin-bottom:6px; }
        .progress-track.on-dark { background:rgba(255,255,255,.22); }
        .progress-fill { height:100%; background:currentColor; border-radius:2px; transition:width .2s ease; }
        .progress-label { font-family:var(--font-subtitle); font-size:13px; opacity:.7; margin-bottom:2px; }
        .progress-sub { font-family:var(--font-subtitle); font-size:11px; opacity:.55; margin-bottom:26px; }
        .q-block { animation:fadeIn .25s ease; } @keyframes fadeIn { from{opacity:0;transform:translateY(4px);} to{opacity:1;transform:translateY(0);} }
        .scale-row { display:flex; align-items:center; justify-content:space-between; gap:clamp(6px,2vw,14px); margin:40px 0 10px; }
        .scale-target { flex:1; max-width:56px; aspect-ratio:1; border-radius:50%; border:1.5px solid ${COLORS.cream}; background:transparent; cursor:pointer; -webkit-tap-highlight-color:transparent; touch-action:manipulation; transition:background .2s ease,transform .15s ease; }
        .scale-target:focus-visible { outline:2px solid ${COLORS.yellow}; outline-offset:3px; }
        .scale-target:hover:not(:disabled) { transform:translateY(-1px); } .scale-target:active:not(:disabled) { transform:scale(.95); }
        .scale-target.selected { background:${COLORS.cream}; border-color:${COLORS.cream}; } .scale-target:disabled { cursor:default; }
        /* Roots (dark cocoa) screens only: solid Warm Cream circles with a visible number,
           per revision request. Rhythms/Reach keep the plain neutral outline dot unchanged. */
        .scale-target.filled { background:${COLORS.cream}; border-color:transparent; color:${COLORS.cocoa}; -webkit-text-fill-color:${COLORS.cocoa}; font-family:var(--font-body); font-weight:600; font-size:clamp(18px,4.2vw,22px); display:flex; align-items:center; justify-content:center; }
        .scale-target.filled.selected { background:${COLORS.cocoa}; color:${COLORS.cream}; -webkit-text-fill-color:${COLORS.cream}; transform:scale(1.08); box-shadow:0 4px 14px rgba(0,0,0,.25); }
        .scale-endpoints { display:flex; justify-content:space-between; font-family:var(--font-subtitle); font-size:13px; opacity:.75; margin-bottom:4px; }
        .choice-list { display:flex; flex-direction:column; gap:10px; margin:22px 0 12px; }
        .choice-row { text-align:left; font-family:var(--font-body); font-size:15px; line-height:1.5; padding:15px 18px; border-radius:14px; border:1.5px solid ${COLORS.ink}; background:transparent; color:${COLORS.ink}; -webkit-text-fill-color:${COLORS.ink}; -webkit-tap-highlight-color:transparent; cursor:pointer; opacity:.85; transition:opacity .2s ease,background .2s ease,transform .15s ease; }
        .choice-row:hover:not(:disabled) { opacity:1; } .choice-row:active:not(:disabled) { transform:scale(.99); }
        .choice-row.selected { background:${COLORS.ink}; border-color:${COLORS.ink}; opacity:1; } .choice-row.selected span { color:${COLORS.cream}; -webkit-text-fill-color:${COLORS.cream}; }
        textarea.snap-textarea { width:100%; font-family:var(--font-body); font-size:16px; line-height:1.55; padding:14px 16px; border:1px solid rgba(38,53,42,.4); border-radius:14px; background:${COLORS.cream}; color:${COLORS.ink}; min-height:100px; resize:vertical; margin:18px 0 4px; }
        textarea.snap-textarea:focus { outline:none; border-color:${COLORS.ink}; }
        input.snap-input { width:100%; font-family:var(--font-body); font-size:16px; padding:13px 16px; border:1px solid rgba(38,53,42,.4); border-radius:999px; background:${COLORS.cream}; color:${COLORS.ink}; margin:12px 0 4px; }
        .small-label { font-family:var(--font-subtitle); font-size:13px; opacity:.65; margin:20px 0 2px; }
        .counter-pill { font-family:var(--font-subtitle); font-size:12px; opacity:.65; margin:8px 0 0; }
        .section-verse { font-family:var(--font-subtitle); font-size:13px; letter-spacing:.12em; text-transform:uppercase; opacity:.7; margin-bottom:10px; }
        .transition-wrap { text-align:center; padding-top:18vh; }
        .callout { margin-top:24px; padding:20px 22px; border-radius:16px; border:1px solid rgba(38,53,42,.18); background:rgba(104,125,98,.08); }
        .callout.growth { background:rgba(131,174,193,.14); } .callout.imbalance { background:rgba(242,201,76,.16); } .callout.standout { background:${COLORS.ink}; color:${COLORS.cream}; }
        .callout-def { font-family:var(--font-subtitle); font-size:13px; opacity:.85; margin:-2px 0 14px; line-height:1.5; }
        .option-card { width:100%; text-align:left; padding:16px 18px; border-radius:14px; border:1.5px solid rgba(38,53,42,.3); background:${COLORS.cream}; color:${COLORS.ink}; cursor:pointer; margin-bottom:10px; font-family:var(--font-body); transition:border-color .2s ease,background .2s ease; }
        .option-card:hover { border-color:${COLORS.ink}; } .option-card.selected { border-color:${COLORS.green}; background:rgba(104,125,98,.14); }
        .option-card .oc-title { font-family:var(--font-title); font-size:17px; margin-bottom:2px; }
        .option-card .oc-meta { font-family:var(--font-subtitle); font-size:12px; text-transform:uppercase; letter-spacing:.08em; opacity:.6; margin-bottom:6px; display:flex; gap:8px; align-items:center; }
        .option-card .oc-body { font-size:14px; line-height:1.5; opacity:.85; margin-bottom:8px; }
        .oc-trains { font-family:var(--font-subtitle); font-size:12.5px; font-style:italic; opacity:.7; border-top:1px dashed rgba(38,53,42,.2); padding-top:8px; }
        .type-tag { font-family:var(--font-subtitle); font-size:10px; letter-spacing:.08em; padding:1px 8px; border-radius:999px; border:1px solid ${COLORS.cocoa}; color:${COLORS.cocoa}; }
        .vision-card { border-radius:16px; padding:18px 20px; margin-bottom:16px; background:${COLORS.ink}; color:${COLORS.cream}; }
        .vision-row { margin-bottom:10px; } .vision-row:last-child{margin-bottom:0;}
        .vision-label { font-family:var(--font-subtitle); font-size:11px; letter-spacing:.1em; text-transform:uppercase; opacity:.6; margin-bottom:2px; }
        .vision-text { font-family:var(--font-body); font-size:14.5px; line-height:1.5; }
        .lens-line { font-family:var(--font-subtitle); font-style:italic; font-size:14px; opacity:.8; margin:0 0 16px; }
        .trellis-card { border:1px solid rgba(38,53,42,.25); border-radius:16px; padding:22px; margin-top:20px; background:${COLORS.cream}; }
        .trellis-row { margin-bottom:14px; } .trellis-row:last-child{margin-bottom:0;}
        .trellis-label { font-family:var(--font-subtitle); font-size:12px; text-transform:uppercase; letter-spacing:.1em; opacity:.6; margin-bottom:3px; }
        .trellis-value { font-family:var(--font-body); font-size:15px; line-height:1.5; }
        .resource-row { padding:12px 0; border-bottom:1px solid rgba(38,53,42,.12); font-family:var(--font-body); font-size:14px; } .resource-row:last-child{border-bottom:none;}
        .resource-type { font-family:var(--font-subtitle); font-size:11px; text-transform:uppercase; letter-spacing:.1em; opacity:.55; }
        .closing-line { font-family:var(--font-title); font-style:italic; font-size:18px; line-height:1.5; margin-top:32px; color:${COLORS.green}; }
        .legend-line { font-family:var(--font-subtitle); font-size:11.5px; opacity:.6; text-align:center; margin:4px 0 20px; }
        .bar-section { margin-top:34px; } .bar-section-label { font-family:var(--font-subtitle); font-size:13px; letter-spacing:.1em; text-transform:uppercase; color:${COLORS.green}; margin-bottom:14px; }
        .bar-pair-label { font-family:var(--font-subtitle); font-size:11.5px; letter-spacing:.08em; text-transform:uppercase; opacity:.5; margin:14px 0 6px; }
        /* Diverging pair visualization: one shared line per rhythm pair. The center
           marks Needs Cultivation; each side grows independently toward its own
           Flourishing at its own outer edge. No axes, ticks, numbers, or legend —
           just the line and the two end labels. */
        .diverge-row { margin-bottom:24px; }
        .diverge-line { display:grid; grid-template-columns:auto 1fr auto; grid-template-areas:"left track right"; align-items:center; gap:12px; }
        .diverge-end { display:flex; flex-direction:column; font-family:var(--font-body); font-size:13.5px; line-height:1.25; max-width:92px; }
        .diverge-end.left { grid-area:left; text-align:left; }
        .diverge-end.right { grid-area:right; text-align:right; }
        .diverge-name { font-weight:500; }
        .diverge-band { font-family:var(--font-subtitle); font-size:10.5px; opacity:.6; }
        .diverge-track { grid-area:track; position:relative; height:8px; border-radius:999px; background:rgba(38,53,42,.08); min-width:48px; }
        .diverge-center { position:absolute; left:50%; top:-3px; bottom:-3px; width:2px; background:rgba(38,53,42,.2); transform:translateX(-1px); }
        .diverge-fill { position:absolute; top:0; height:100%; transition:width .4s ease; }
        .diverge-fill.left { right:50%; border-radius:999px 0 0 999px; }
        .diverge-fill.right { left:50%; border-radius:0 999px 999px 0; }
        /* Mobile fallback, only if the shared line gets too tight: labels move to
           their own row above, still flanking left/right — the paired bar itself
           never reverts to two separate stacked bars. */
        @media (max-width:400px){
          .diverge-line { grid-template-columns:1fr 1fr; grid-template-areas:"left right" "track track"; row-gap:6px; }
          .diverge-end { max-width:none; }
        }
        .bar-row { margin-bottom:16px; }
        .bar-top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:5px; font-family:var(--font-body); font-size:14.5px; }
        .bar-band { font-family:var(--font-subtitle); font-size:12px; opacity:.65; }
        .bar-track { position:relative; height:6px; border-radius:999px; background:rgba(38,53,42,.1); }
        .bar-fill { position:relative; height:100%; border-radius:999px; transition:width .4s ease; }
        .bar-dot { position:absolute; right:-3px; top:50%; transform:translateY(-50%); width:10px; height:10px; border-radius:50%; box-shadow:0 0 0 3px ${COLORS.cream}; }
        @media (max-width:480px){ .snap-app{padding:36px 16px 70px;} .scale-target{max-width:46px;} }
      `}</style>

      <div className="snap-card">
        {stage === "intro" && pendingResume && (
          <>
            <div className="eyebrow">The Garden</div>
            <h1 className="snap-title">Welcome back</h1>
            <p className="snap-body">{describeResumePoint(pendingResume)}</p>
            <div className="btn-row">
              <button className="snap-btn primary on-cream" onClick={resumeSession}><span>Continue Where I Left Off</span></button>
              <button className="snap-btn" onClick={startFreshFromResume}><span>Start Fresh</span></button>
            </div>
          </>
        )}

        {stage === "intro" && !pendingResume && (
          <>
            <div className="eyebrow">The Garden</div>
            <h1 className="snap-title">Your Spiritual Health Snapshot</h1>
            <p className="snap-body">30 questions · about 5–7 minutes. A short reflection across Roots, Rhythms, and Reach — then a picture of where things stand, and one small practice to carry forward.</p>
            <p className="snap-body" style={{ opacity: 0.75 }}>This isn't a grade, and there's no overall score. Answer based on what's actually true of your life right now.</p>
            <div className="btn-row"><button className="snap-btn primary on-cream" onClick={() => setStage("quiz")}><span>Begin</span></button></div>
          </>
        )}

        {stage === "quiz" && step && step.type === "transition" && (
          <div className="transition-wrap q-block" key={quizStepIndex}>
            <div className="section-verse">{sectionMeta.verseTag}</div>
            <h1 className="snap-title">{sectionMeta.label}</h1>
            <p className="snap-body">{sectionMeta.intro}</p>
            <div className="btn-row" style={{ justifyContent: "center" }}><button className="snap-btn" onClick={advanceOrFinish}><span>Continue</span></button></div>
          </div>
        )}

        {stage === "quiz" && step && step.type !== "transition" && (
          <div className="q-block" key={quizStepIndex}>
            <button className="back-link" onClick={goBackQuiz} disabled={quizStepIndex === 0 || transitioning}>← Back</button>

            {step.type === "likert" && (
              <>
                <div className={`progress-track${onDark ? " on-dark" : ""}`}><div className="progress-fill" style={{ width: `${Math.round((step.globalNumber / TOTAL_QUESTIONS) * 100)}%` }} /></div>
                <div className="progress-label">Question {step.globalNumber} of {TOTAL_QUESTIONS}</div>
                <div className="progress-sub">{sectionMeta.label.toUpperCase()} · {step.sectionPosition} of {step.sectionTotal}</div>
                <h1 className="snap-title">{step.prompt}</h1>
                <div className="scale-row">{[1, 2, 3, 4, 5].map((val) => (<button key={val} disabled={transitioning} className={`scale-target${step.section === "roots" ? " filled" : ""}${answers[step.id] === val ? " selected" : ""}`} onClick={() => selectLikert(val)} aria-label={`Response ${val} of 5`}>{step.section === "roots" ? val : null}</button>))}</div>
                <div className="scale-endpoints"><span>Not yet</span><span>Flourishing</span></div>
              </>
            )}

            {step.type === "context" && (
              <>
                <div className="progress-label">GETTING TO KNOW YOU</div>
                <h1 className="snap-title">{step.prompt}</h1>
                <div className="choice-list">{step.options.map((opt) => (<button key={opt} disabled={transitioning} className={`choice-row${answers[step.id] === opt ? " selected" : ""}`} onClick={() => selectContext(opt)}><span>{opt}</span></button>))}</div>
                <div className="btn-row"><button className="snap-btn" onClick={advanceOrFinish}><span>Skip</span></button></div>
              </>
            )}

            {step.type === "text" && (
              <>
                <div className="progress-label">REFLECTION</div>
                <h1 className="snap-title">{step.prompt}</h1>
                <textarea className="snap-textarea" value={textDraft} onChange={(e) => setTextDraft(e.target.value)} placeholder="Take your time — a few sentences is plenty." />
                <div className="btn-row"><button className="snap-btn primary on-cream" onClick={submitText}><span>Continue</span></button></div>
              </>
            )}

            {step.type === "multi-select-text" && (() => {
              // All 30 answers exist by this point in the flow, so the guided
              // suggestions can be computed live from the participant's own scores.
              const liveDimScores = getAllDimensionScores(answers);
              const sortedAsc = [...DIMENSION_ORDER].sort((a, b) => liveDimScores[a] - liveDimScores[b]);
              const suggested = sortedAsc.slice(0, 4);
              const remaining = DIMENSION_ORDER.filter((d) => !suggested.includes(d));
              const renderAreaCard = (d) => (
                <button key={d} className={`option-card${selectDraft.includes(DIMENSIONS[d].label) ? " selected" : ""}`} onClick={() => toggleReflection3(DIMENSIONS[d].label)}>
                  <div className="oc-title">{DIMENSIONS[d].label}</div>
                  <div className="oc-meta">{getLabelForScore(liveDimScores[d])}</div>
                  <div className="oc-body">{DESCRIPTORS[d]}</div>
                </button>
              );
              return (
                <>
                  <div className="progress-label">REFLECTION</div>
                  <h1 className="snap-title">{step.prompt}</h1>
                  <p className="snap-body" style={{ opacity: 0.75, marginBottom: 6 }}>{step.helper}</p>
                  <div className="counter-pill">{selectDraft.filter((l) => l !== NOT_SURE_LABEL).length} of 2 selected</div>

                  {suggested.map(renderAreaCard)}

                  {!showAllReflectionAreas && (
                    <button className="back-link" style={{ marginTop: 4 }} onClick={() => setShowAllReflectionAreas(true)}>Something else is standing out →</button>
                  )}
                  {showAllReflectionAreas && (
                    <>
                      <div className="small-label" style={{ marginTop: 16 }}>OTHER AREAS</div>
                      {remaining.map(renderAreaCard)}
                      <button
                        key={NOT_SURE_LABEL}
                        className={`choice-row${selectDraft.includes(NOT_SURE_LABEL) ? " selected" : ""}`}
                        style={{ marginTop: 10 }}
                        onClick={() => toggleReflection3(NOT_SURE_LABEL)}
                      ><span>{NOT_SURE_LABEL}</span></button>
                    </>
                  )}

                  <div className="small-label" style={{ marginTop: 20 }}>{step.textLabel}</div>
                  <textarea className="snap-textarea" style={{ minHeight: 70 }} value={textDraft} onChange={(e) => setTextDraft(e.target.value)} placeholder="Optional" />
                  <div className="btn-row"><button className="snap-btn primary on-cream" onClick={submitMultiSelectText} disabled={selectDraft.length === 0}><span>Continue</span></button></div>
                </>
              );
            })()}
          </div>
        )}

        {stage === "snapshot" && (
          <>
            <div className="eyebrow">Your Snapshot</div>
            <h1 className="snap-title">Here's what seems to be growing right now.</h1>
            <p className="snap-body">There's no single spiritual-health score. This is simply a snapshot of where your Roots, Rhythms, and Reach seem to be right now.</p>

            <div className="callout standout">
              <h2 className="snap-h2">A few things stand out.</h2>
              <p className="snap-body" style={{ opacity: 0.92 }}>{standout}</p>
              <button className="back-link" style={{ color: COLORS.cream, opacity: 0.85 }} onClick={() => chartRef.current?.scrollIntoView({ behavior: "smooth" })}>Explore your full Snapshot ↓</button>
            </div>

            <div ref={chartRef} />
            <div className="legend-line" style={{ marginTop: 30 }}>Needs Cultivation → Beginning → Taking Root → Growing → Flourishing · longer bars indicate more established growth</div>

            {["roots", "rhythms", "reach"].map((sectionId) => (
              <div className="bar-section" key={sectionId}>
                <div className="bar-section-label">{SECTION_META[sectionId].label}</div>
                {sectionId === "rhythms"
                  ? PAIR_ORDER.map((pairId) => (
                      (() => {
                        const [leftId, rightId] = PAIR_META[pairId].sides;
                        const leftPct = ((dimScores[leftId] - 1) / 4) * 100;
                        const rightPct = ((dimScores[rightId] - 1) / 4) * 100;
                        return (
                          <div className="diverge-row" key={pairId}>
                            <div className="bar-pair-label">{PAIR_META[pairId].label}</div>
                            <div className="diverge-line">
                              <div className="diverge-end left">
                                <span className="diverge-name">{DIMENSIONS[leftId].label}</span>
                                <span className="diverge-band">{getLabelForScore(dimScores[leftId])}</span>
                              </div>
                              <div className="diverge-track">
                                <div className="diverge-center" />
                                <div className="diverge-fill left" style={{ width: `${leftPct / 2}%`, background: SECTION_BAR_COLOR.rhythms }} />
                                <div className="diverge-fill right" style={{ width: `${rightPct / 2}%`, background: SECTION_BAR_COLOR.rhythms }} />
                              </div>
                              <div className="diverge-end right">
                                <span className="diverge-name">{DIMENSIONS[rightId].label}</span>
                                <span className="diverge-band">{getLabelForScore(dimScores[rightId])}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ))
                  : DIMENSION_ORDER.filter((d) => DIMENSIONS[d].section === sectionId).map((d) => (
                      <div className="bar-row" key={d}>
                        <div className="bar-top"><span>{DIMENSIONS[d].label}</span><span className="bar-band">{getLabelForScore(dimScores[d])}</span></div>
                        <div className="bar-track"><div className="bar-fill" style={{ width: `${((dimScores[d] - 1) / 4) * 100}%`, background: SECTION_BAR_COLOR[sectionId] }}><span className="bar-dot" style={{ background: SECTION_BAR_COLOR[sectionId] }} /></div></div>
                      </div>
                    ))}
              </div>
            ))}

            <div className="callout growth">
              <h2 className="snap-h2">{showDeepenFraming ? "A Place You Could Deepen" : "Growth Edges"}</h2>
              {!showDeepenFraming && (
                <div className="callout-def">Growth edges are areas that may hold meaningful opportunity for growth in this season. They come from a combination of your responses, noticeable gaps between paired rhythms, and areas you said already deserve attention. A growth edge isn't a failure. It's simply a place worth paying attention to.</div>
              )}
              {focusCandidates.map((d) => (<p className="snap-body" key={d} style={{ marginBottom: 10 }}><strong>{DIMENSIONS[d].label} — {getLabelForScore(dimScores[d])}.</strong> {DESCRIPTORS[d]}</p>))}
            </div>

            {imbalances.some((im) => im.flagged) && (
              <div className="callout imbalance">
                <h2 className="snap-h2">Something Worth Noticing</h2>
                {imbalances.filter((im) => im.flagged).map((im) => { const c = IMBALANCE_COPY[`${im.pairId}:${im.higherSide}`]; return (<p className="snap-body" key={im.pairId} style={{ marginBottom: 10 }}><strong>{c.title}</strong><br />{c.body}</p>); })}
              </div>
            )}

            <div className="btn-row"><button className="snap-btn primary on-cream" onClick={() => setStage("choose-focus")}><span>Choose a Focus</span></button></div>
          </>
        )}

        {stage === "choose-focus" && (
          <>
            <button className="back-link" onClick={goBackPost}>← Back</button>
            <div className="eyebrow">Choose a Focus</div>
            <h1 className="snap-title">Where might you cultivate next?</h1>
            <p className="snap-body">Your results can give you clues, but growth with Jesus isn't an algorithm. Pay attention to what resonates and where you sense an invitation to grow.</p>

            {!exploreAll && focusCandidates.map((d) => (
              <button key={d} className={`option-card${chosenFocus === d ? " selected" : ""}`} onClick={() => setChosenFocus(d)}>
                <div className="oc-title">{DIMENSIONS[d].label}</div><div className="oc-meta">{getLabelForScore(dimScores[d])}</div>
                <div className="oc-body">{getCandidateReason(d, imbalances, selfSelectedDims, dimScores)}</div>
              </button>
            ))}
            {!exploreAll && <button className="back-link" style={{ marginTop: 6 }} onClick={() => setExploreAll(true)}>Explore all areas →</button>}
            {exploreAll && (
              <>
                {["roots", "rhythms", "reach"].map((sectionId) => (
                  <div key={sectionId}>
                    <div className="small-label" style={{ marginTop: 16 }}>{SECTION_META[sectionId].label.toUpperCase()}</div>
                    {DIMENSION_ORDER.filter((d) => DIMENSIONS[d].section === sectionId).map((d) => (
                      <button key={d} className={`option-card${chosenFocus === d ? " selected" : ""}`} onClick={() => setChosenFocus(d)} style={{ marginTop: 8 }}>
                        <div className="oc-title">{DIMENSIONS[d].label}</div><div className="oc-meta">{getLabelForScore(dimScores[d])}</div>
                      </button>
                    ))}
                  </div>
                ))}
                <button className="back-link" style={{ marginTop: 6 }} onClick={() => setExploreAll(false)}>← Back to recommended</button>
              </>
            )}
            <div className="btn-row"><button className="snap-btn primary on-cream" disabled={!chosenFocus} onClick={goFormation}><span>Continue</span></button></div>
          </>
        )}

        {stage === "formation" && chosenFocus && (
          <>
            <button className="back-link" onClick={goBackPost}>← Back</button>
            <div className="eyebrow">A Little More Context</div>
            <h1 className="snap-title">What's making {DIMENSIONS[chosenFocus].label} difficult right now?</h1>
            <p className="snap-body" style={{ opacity: 0.75 }}>Understanding what's underneath the pattern can help you choose a better next step. This isn't scored — it just shapes what we suggest next.</p>
            <div className="choice-list">
              {FORMATION_QUESTIONS[chosenFocus].map((opt) => (
                <button key={opt.label} className={`choice-row${formationAnswer && formationAnswer.label === opt.label ? " selected" : ""}`} onClick={() => setFormationAnswer(opt)}><span>{opt.label}</span></button>
              ))}
            </div>
            <div className="btn-row"><button className="snap-btn primary on-cream" disabled={!formationAnswer} onClick={() => setStage("choose-practice")}><span>Continue</span></button></div>
          </>
        )}

        {stage === "choose-practice" && chosenFocus && (
          <>
            <button className="back-link" onClick={goBackPost}>← Back</button>
            <div className="eyebrow">Choose a Practice</div>
            <h1 className="snap-title">{DIMENSIONS[chosenFocus].label}</h1>

            <div className="vision-card">
              <div className="vision-row"><div className="vision-label">The story around us</div><div className="vision-text">{VISION[chosenFocus].story}</div></div>
              <div className="vision-row"><div className="vision-label">The way of Jesus</div><div className="vision-text">{VISION[chosenFocus].jesus}</div></div>
            </div>

            {lens !== "cultivate" && (
              <>
                <p className="lens-line">{LENS_COPY[lens].insight}</p>
                <button className={`option-card${chosenPractice && chosenPractice.title === LENS_COPY[lens].cardTitle ? " selected" : ""}`} onClick={() => setChosenPractice({ title: LENS_COPY[lens].cardTitle, description: LENS_COPY[lens].cardBody(DIMENSIONS[chosenFocus].label), trains: "", tier: null, type: lens })}>
                  <div className="oc-meta">{lens.toUpperCase()}</div>
                  <div className="oc-title">{LENS_COPY[lens].cardTitle}</div>
                  <div className="oc-body">{LENS_COPY[lens].cardBody(DIMENSIONS[chosenFocus].label)}</div>
                </button>
                <div className="small-label" style={{ margin: "16px 0 -6px" }}>OR, IF A RHYTHM STILL FEELS RIGHT</div>
              </>
            )}

            <p className="snap-body" style={{ opacity: 0.8, marginTop: 16 }}>Practices help train our loves. Choose one small rhythm that could help this way of Jesus become more natural over time — small is fine, and you can change it after 30 days.</p>

            {(showHiddenTier ? TIER_ORDER : tierWindow).map((tierKey) => {
              const p = PRACTICES[chosenFocus].find((pr) => pr.tier === tierKey);
              return (
                <button key={tierKey} className={`option-card${chosenPractice && chosenPractice.title === p.title ? " selected" : ""}`} onClick={() => { setChosenPractice(p); setShowCustomPractice(false); }}>
                  <div className="oc-meta">{TIER_META[tierKey].label}{p.type !== "cultivate" && <span className="type-tag">{p.type.toUpperCase()}</span>}</div>
                  <div className="oc-title">{p.title}</div>
                  <div className="oc-body">{p.description}</div>
                  <div className="oc-trains">What this trains: {p.trains}</div>
                </button>
              );
            })}
            {!showHiddenTier && <button className="back-link" onClick={() => setShowHiddenTier(true)}>Explore more practices →</button>}

            <button className={`option-card${showCustomPractice ? " selected" : ""}`} style={{ marginTop: 12 }} onClick={() => { setShowCustomPractice(true); setChosenPractice(null); }}><div className="oc-title">+ Create my own</div></button>
            {showCustomPractice && <input className="snap-input" placeholder="Name your own practice" value={customPractice} onChange={(e) => setCustomPractice(e.target.value)} />}

            <div className="btn-row">
              <button className="snap-btn primary on-cream" disabled={!chosenPractice && !(showCustomPractice && customPractice.trim())} onClick={() => { if (showCustomPractice) setChosenPractice({ title: customPractice.trim(), description: "", trains: "", tier: null, type: "cultivate" }); goAddTrellis(); }}><span>Continue</span></button>
            </div>
          </>
        )}

        {stage === "add-trellis" && chosenFocus && chosenPractice && (
          <>
            <button className="back-link" onClick={goBackPost}>← Back</button>
            <div className="eyebrow">Add to My Trellis</div>
            <h1 className="snap-title">A trellis doesn't create life.</h1>
            <p className="snap-body">It simply creates structure for healthy growth. You don't need to overhaul your life — choose one practice small enough to live and meaningful enough to form you.</p>
            <div className="trellis-card">
              <div className="trellis-row"><div className="trellis-label">Focus</div><div className="trellis-value">{DIMENSIONS[chosenFocus].label}</div></div>
              <div className="trellis-row"><div className="trellis-label">Practice</div><div className="trellis-value">{chosenPractice.title}{chosenPractice.type && chosenPractice.type !== "cultivate" && <span className="type-tag" style={{ marginLeft: 8 }}>{chosenPractice.type.toUpperCase()}</span>}</div></div>
              {chosenPractice.trains && <div className="trellis-row"><div className="trellis-label">What This Trains</div><div className="trellis-value">{chosenPractice.trains}</div></div>}
              <div className="trellis-row"><div className="trellis-label">My Intention</div><textarea className="snap-textarea" style={{ margin: "6px 0 0" }} value={intention} onChange={(e) => setIntention(e.target.value)} placeholder="Make it specific to your actual week." /></div>
              <div className="trellis-row"><div className="trellis-label">When will you practice this?</div><input className="snap-input" style={{ margin: "6px 0 0" }} value={cadence} onChange={(e) => setCadence(e.target.value)} placeholder="e.g. Every other Thursday at 7:00 PM" /></div>
            </div>
            <div className="btn-row"><button className="snap-btn primary on-cream" onClick={() => setStage("resources")}><span>Add to My Trellis</span></button></div>
          </>
        )}

        {stage === "resources" && chosenFocus && (
          <>
            <button className="back-link" onClick={goBackPost}>← Back</button>
            <div className="eyebrow">Want Some Help Getting Started?</div>
            <h1 className="snap-title">A few supports for {DIMENSIONS[chosenFocus].label}</h1>
            <p className="snap-body" style={{ opacity: 0.75 }}>Practice first, resources second — these support the practice, they don't replace it.</p>
            {getPlaceholderResources(chosenFocus).map((r) => (<div className="resource-row" key={r.label}><div className="resource-type">{r.type}</div>{r.label}</div>))}
            <div className="btn-row"><button className="snap-btn primary on-cream" onClick={() => setStage("community")}><span>Continue</span></button></div>
          </>
        )}

        {stage === "community" && (
          <>
            <button className="back-link" onClick={goBackPost}>← Back</button>
            <div className="eyebrow">Don't Cultivate Alone</div>
            <h1 className="snap-title">Who could you share this with?</h1>
            <p className="snap-body">Talk with them this week about what you're practicing, and ask them to check in with you.</p>
            <input className="snap-input" placeholder="Name (optional)" value={communityPerson} onChange={(e) => setCommunityPerson(e.target.value)} />
            <div className="btn-row"><button className="snap-btn primary on-cream" onClick={() => setStage("followup")}><span>Continue</span></button></div>
          </>
        )}

        {stage === "followup" && (
          <>
            <button className="back-link" onClick={goBackPost}>← Back</button>
            <div className="eyebrow">Follow-Up</div>
            <h1 className="snap-title">Two different rhythms</h1>
            <p className="snap-body">A quick check on the practice itself, and a longer look at the whole picture later.</p>
            <div className="trellis-card">
              <div className="trellis-row"><div className="trellis-label">Practice check-in</div><div className="trellis-value">In about 30 days</div></div>
              <div className="trellis-row"><div className="trellis-label">Full Snapshot retake</div><div className="trellis-value">In about 6 months</div></div>
            </div>
            <div className="btn-row"><button className="snap-btn primary on-cream" onClick={confirmFollowUp}><span>Continue</span></button></div>
          </>
        )}

        {stage === "future-self" && (
          <>
            <button className="back-link" onClick={goBackPost}>← Back</button>
            <div className="eyebrow">A Note to Your Future Self</div>
            <h1 className="snap-title">What do you want to remember about this season?</h1>
            <p className="snap-body" style={{ opacity: 0.75 }}>We'll show this back to you at your next Snapshot.</p>
            <textarea className="snap-textarea" style={{ minHeight: 130 }} value={futureSelfNote} onChange={(e) => setFutureSelfNote(e.target.value)} placeholder="I want to remember…" />
            <div className="btn-row"><button className="snap-btn primary on-cream" onClick={proceedToSaveResults}><span>Finish</span></button></div>
          </>
        )}

        {stage === "save-results" && (
          <>
            <button className="back-link" onClick={goBackPost}>← Back</button>
            <div className="eyebrow">Save Your Results</div>
            <h1 className="snap-title">Want to save a copy of this Snapshot?</h1>

            {!resultsSaved && (
              <>
                <p className="snap-body">Your results can be saved so you and The Garden's ministry leaders can refer back to them later.</p>
                <p className="snap-body" style={{ opacity: 0.7 }}>Prefer not to save them? You can continue without storing your results.</p>
                <input className="snap-input" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                <input className="snap-input" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                <input className="snap-input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                {submitStatus === "error" && <p className="snap-body" style={{ opacity: 0.85 }}>{saveError}</p>}
                <div className="btn-row">
                  <button className="snap-btn primary on-cream" disabled={submitStatus === "saving"} onClick={saveResultsToSupabase}><span>{submitStatus === "saving" ? "Saving…" : "Save My Results"}</span></button>
                  <button className="snap-btn" disabled={submitStatus === "saving"} onClick={() => setStage("trellis")}><span>Continue Without Saving</span></button>
                </div>
              </>
            )}
            {resultsSaved && (
              <>
                <p className="snap-body">Saved.</p>
                <div className="btn-row"><button className="snap-btn primary on-cream" onClick={() => setStage("trellis")}><span>Continue</span></button></div>
              </>
            )}
          </>
        )}

        {stage === "trellis" && chosenFocus && (
          <>
            <div className="eyebrow">My Trellis</div>
            <h1 className="snap-title">Here's what you're carrying forward</h1>
            <div className="trellis-card">
              <div className="trellis-row"><div className="trellis-label">Focus</div><div className="trellis-value">{DIMENSIONS[chosenFocus].label}</div></div>
              <div className="trellis-row"><div className="trellis-label">Practice</div><div className="trellis-value">{chosenPractice ? chosenPractice.title : ""}</div></div>
              {intention && <div className="trellis-row"><div className="trellis-label">Intention</div><div className="trellis-value">{intention}</div></div>}
              {cadence && <div className="trellis-row"><div className="trellis-label">When</div><div className="trellis-value">{cadence}</div></div>}
              {communityPerson && <div className="trellis-row"><div className="trellis-label">Sharing this with</div><div className="trellis-value">{communityPerson}</div></div>}
              <div className="trellis-row"><div className="trellis-label">Practice check-in</div><div className="trellis-value">{formatDate(followUp.practiceCheckInDate)}</div></div>
              <div className="trellis-row"><div className="trellis-label">Snapshot retake</div><div className="trellis-value">{formatDate(followUp.snapshotRetakeDate)}</div></div>
              {futureSelfNote && <div className="trellis-row"><div className="trellis-label">A note to your future self</div><div className="trellis-value">{futureSelfNote}</div></div>}
            </div>
            <p className="closing-line">The goal isn't a perfect score. It's noticing where Jesus is producing growth, and responding faithfully to where he is inviting you next.</p>
            <div className="btn-row">
              <button className="snap-btn" onClick={startOver}><span>Start a New Reflection</span></button>
              <button className="snap-btn primary on-cream" onClick={() => window.print()}><span>Save / Print</span></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
