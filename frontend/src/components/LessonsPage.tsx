import React, { useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  FlaskConical,
  HelpCircle,
  Lightbulb,
  PlayCircle,
  Sparkles,
} from "lucide-react";
import { LESSONS } from "../data/curriculum";
import type { TranslationDict } from "../i18n/translations";

interface LessonsPageProps {
  t: TranslationDict;
  currentPuzzleId: string | undefined;
  onLoadPuzzle: (puzzleId: string) => void;
  onBackToBoard: () => void;
  onOpenQuiz: () => void;
}

const CONCEPT_BADGE: Record<string, string> = {
  SUPERPOSITION: "border-amber-500/40 bg-amber-500/15 text-amber-200",
  BELL: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200",
  GHZ: "border-violet-500/40 bg-violet-500/15 text-violet-200",
  W: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  NOISE: "border-rose-500/40 bg-rose-500/15 text-rose-200",
  SCALING: "border-pink-500/40 bg-pink-500/15 text-pink-200",
};

export const LessonsPage: React.FC<LessonsPageProps> = ({
  t,
  currentPuzzleId,
  onLoadPuzzle,
  onBackToBoard,
  onOpenQuiz,
}) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);

  const activeLesson = LESSONS[activeIdx] ?? LESSONS[0];
  const isCompleted = completedIds.includes(activeLesson.id);
  const isBoardLoaded =
    currentPuzzleId === activeLesson.puzzleId ||
    currentPuzzleId === activeLesson.warmupPuzzleId;

  const markComplete = (id: string) => {
    setCompletedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  const handleCompleteAndNext = () => {
    markComplete(activeLesson.id);
    if (activeIdx + 1 < LESSONS.length) {
      setActiveIdx(activeIdx + 1);
    } else {
      onOpenQuiz();
    }
  };

  return (
    <div className="max-w-7xl w-full mx-auto px-4 py-6 space-y-5 flex-1">
      {/* Top Page Breadcrumb Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-[#0F1629]/95 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToBoard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 hover:border-cyan-400 px-3 py-1.5 text-xs font-semibold text-slate-200 transition"
          >
            <ArrowLeft className="w-4 h-4 text-cyan-400" />
            {t.btn_back_to_board}
          </button>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-cyan-400" />
              {t.lessons_title}
            </h2>
            <p className="text-xs text-slate-400">{t.lessons_page_subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 text-xs font-mono text-emerald-300">
            {completedIds.length} / {LESSONS.length} {t.lessons_completed}
          </span>
          <button
            type="button"
            onClick={onOpenQuiz}
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/15 hover:bg-violet-500/25 px-3 py-1.5 text-xs font-semibold text-violet-200 transition"
          >
            <HelpCircle className="w-4 h-4" />
            {t.btn_quiz}
          </button>
        </div>
      </div>

      {/* Main Two-Column Page Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Chapter Sidebar */}
        <aside className="lg:col-span-4 space-y-2 rounded-2xl border border-slate-800 bg-[#0F1629]/90 p-3.5 lg:sticky lg:top-20">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 px-1 pb-1">
            {t.lessons_modules_label}
          </div>
          {LESSONS.map((lesson, idx) => {
            const selected = idx === activeIdx;
            const done = completedIds.includes(lesson.id);
            return (
              <button
                key={lesson.id}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`w-full text-left rounded-xl border p-3 transition space-y-1.5 ${
                  selected
                    ? "border-cyan-400/70 bg-cyan-950/30 shadow-lg"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-mono font-bold ${
                      CONCEPT_BADGE[lesson.concept] ?? CONCEPT_BADGE.BELL
                    }`}
                  >
                    {lesson.concept}
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                    <Clock className="w-3 h-3" />
                    <span>{lesson.duration}</span>
                    {done && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </div>
                </div>
                <div className="text-xs sm:text-sm font-bold text-slate-100">
                  {t[lesson.titleKey]}
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  {t[lesson.summaryKey]}
                </p>
              </button>
            );
          })}
        </aside>

        {/* Right Detailed Beginner Reader */}
        <article className="lg:col-span-8 rounded-2xl border border-slate-800 bg-[#0F1629]/95 p-5 sm:p-7 space-y-6 shadow-2xl">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs font-mono font-bold ${
                    CONCEPT_BADGE[activeLesson.concept] ?? CONCEPT_BADGE.BELL
                  }`}
                >
                  {activeLesson.concept}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  Module {activeIdx + 1} of {LESSONS.length} · {activeLesson.duration}
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white">
                {t[activeLesson.titleKey]}
              </h3>
              <p className="text-sm text-cyan-200/90 font-medium">
                {t[activeLesson.summaryKey]}
              </p>
            </div>

            {isBoardLoaded && (
              <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                Active Practice Board
              </span>
            )}
          </div>

          {/* 1. Intuitive Analogy Box */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/15 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
              <Lightbulb className="w-4 h-4" />
              {t.lesson_analogy_heading}
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">
              {t[activeLesson.analogyKey]}
            </p>
          </div>

          {/* 2. Core Concept & Plain Explanation */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
              <Sparkles className="w-4 h-4" />
              {t.lesson_concept_heading}
            </div>
            <p className="text-sm sm:text-base text-slate-200 leading-relaxed">
              {t[activeLesson.bodyKey]}
            </p>
          </div>

          {/* 3. Interactive Quantum Equation Breakdown */}
          <div className="rounded-xl border border-violet-500/30 bg-[#070B14] p-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-violet-300">
              {t.lesson_formula_heading}
            </div>
            <div className="font-mono text-base sm:text-lg font-bold text-violet-200 break-words">
              {activeLesson.formula}
            </div>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              {t[activeLesson.formulaExplainKey]}
            </p>
          </div>

          {/* 4. Try It Step-by-Step in Qudoku */}
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/15 p-4 space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
              <FlaskConical className="w-4 h-4" />
              {t.lesson_try_heading}
            </div>
            <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">
              {t[activeLesson.stepsKey]}
            </p>
          </div>

          {/* 5. Common Misconception vs Reality */}
          <div className="rounded-xl border border-rose-500/25 bg-rose-950/15 p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
              <AlertCircle className="w-4 h-4" />
              {t.lesson_misconception_heading}
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">
              {t[activeLesson.misconceptionKey]}
            </p>
          </div>

          {/* 6. Key Takeaway */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-sm text-emerald-200 font-medium">
            {t[activeLesson.takeawayKey]}
          </div>

          {/* Bottom Interactive Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  markComplete(activeLesson.id);
                  onLoadPuzzle(activeLesson.warmupPuzzleId);
                  onBackToBoard();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-400/50 bg-emerald-500/15 hover:bg-emerald-500/25 px-3.5 py-2 text-xs font-semibold text-emerald-200 transition"
              >
                <PlayCircle className="w-4 h-4" />
                {t.lesson_try_4x4}
              </button>
              <button
                type="button"
                onClick={() => {
                  markComplete(activeLesson.id);
                  onLoadPuzzle(activeLesson.puzzleId);
                  onBackToBoard();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-400/50 bg-cyan-500/15 hover:bg-cyan-500/25 px-3.5 py-2 text-xs font-semibold text-cyan-200 transition"
              >
                <PlayCircle className="w-4 h-4" />
                {t.load_lesson_board}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={activeIdx === 0}
                onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 hover:border-slate-500 disabled:opacity-40 px-3 py-2 text-xs font-semibold text-slate-200 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t.btn_prev_module}
              </button>
              <button
                type="button"
                onClick={handleCompleteAndNext}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 hover:opacity-95 px-4 py-2 text-xs font-bold text-slate-950 transition"
              >
                {isCompleted ? null : <CheckCircle2 className="w-3.5 h-3.5" />}
                {activeIdx + 1 < LESSONS.length ? t.btn_next_module : t.btn_go_to_quiz}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>
  );
};
