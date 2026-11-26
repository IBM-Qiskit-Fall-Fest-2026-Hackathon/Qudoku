import React from "react";
import { BookOpen, PlayCircle, X } from "lucide-react";
import { LESSONS } from "../data/curriculum";
import type { TranslationDict } from "../i18n/translations";

interface LessonDrawerProps {
  open: boolean;
  onClose: () => void;
  t: TranslationDict;
  currentPuzzleId: string | undefined;
  onLoadPuzzle: (puzzleId: string) => void;
}

export const LessonDrawer: React.FC<LessonDrawerProps> = ({
  open,
  onClose,
  t,
  currentPuzzleId,
  onLoadPuzzle,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-[#0F1629] border-l border-slate-800 h-full overflow-y-auto p-5 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-slate-100">{t.lessons_title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {LESSONS.map((lesson) => {
            const isActive = currentPuzzleId === lesson.puzzleId;
            return (
              <div
                key={lesson.id}
                className={`rounded-xl border p-4 space-y-2.5 transition ${
                  isActive
                    ? "border-cyan-400/60 bg-cyan-950/20"
                    : "border-slate-800 bg-slate-900/70"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-sm text-slate-100">{t[lesson.titleKey]}</h3>
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-mono text-cyan-300 shrink-0">
                    {lesson.concept}
                  </span>
                </div>
                <p className="text-xs font-medium text-cyan-200/90">{t[lesson.summaryKey]}</p>
                <div className="rounded-lg bg-[#070B14] border border-slate-800 px-3 py-2 font-mono text-xs text-violet-300">
                  {lesson.formula}
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">{t[lesson.bodyKey]}</p>
                <p className="text-[11px] text-emerald-300/90 bg-emerald-950/25 border border-emerald-500/20 rounded-lg px-2.5 py-1.5">
                  {t[lesson.takeawayKey]}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onLoadPuzzle(lesson.puzzleId);
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition"
                >
                  <PlayCircle className="w-4 h-4" />
                  {t.load_lesson_board}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
