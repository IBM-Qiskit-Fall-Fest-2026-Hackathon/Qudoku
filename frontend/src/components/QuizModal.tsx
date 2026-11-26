import React, { useState } from "react";
import { Award, CheckCircle2, HelpCircle, X, XCircle } from "lucide-react";
import { QUIZ_QUESTIONS } from "../data/curriculum";
import type { TranslationDict } from "../i18n/translations";

interface QuizModalProps {
  open: boolean;
  onClose: () => void;
  t: TranslationDict;
}

export const QuizModal: React.FC<QuizModalProps> = ({ open, onClose, t }) => {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  if (!open) return null;

  const q = QUIZ_QUESTIONS[index];

  const handleSelect = (optIdx: number) => {
    if (selected !== null) return;
    setSelected(optIdx);
    if (optIdx === q.correctIndex) {
      setScore((s) => s + 1);
    }
  };

  const handleNext = () => {
    if (index + 1 < QUIZ_QUESTIONS.length) {
      setIndex((i) => i + 1);
      setSelected(null);
    } else {
      setFinished(true);
    }
  };

  const handleRestart = () => {
    setIndex(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#0F1629] p-5 sm:p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-violet-400" />
            <h2 className="text-lg font-bold text-slate-100">{t.quiz_title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {finished ? (
          <div className="py-6 text-center space-y-4">
            <Award className="w-14 h-14 text-amber-400 mx-auto" />
            <div className="text-2xl font-bold text-slate-100">
              {t.quiz_score}: {score} / {QUIZ_QUESTIONS.length}
            </div>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={handleRestart}
                className="rounded-xl bg-cyan-500 hover:bg-cyan-400 px-4 py-2 text-sm font-bold text-slate-950 transition"
              >
                {t.quiz_restart}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
              >
                {t.quiz_close}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>
                {index + 1} / {QUIZ_QUESTIONS.length}
              </span>
              <span>
                {t.quiz_score}: {score}
              </span>
            </div>

            <p className="text-sm sm:text-base font-semibold text-slate-100 leading-relaxed">
              {t[q.questionKey]}
            </p>

            <div className="space-y-2">
              {q.optionKeys.map((optKey, optIdx) => {
                const isChosen = selected === optIdx;
                const isCorrect = optIdx === q.correctIndex;
                let cls =
                  "border-slate-700 bg-slate-900/80 text-slate-200 hover:border-cyan-400/60";
                if (selected !== null) {
                  if (isCorrect) {
                    cls = "border-emerald-400 bg-emerald-950/40 text-emerald-200";
                  } else if (isChosen) {
                    cls = "border-rose-400 bg-rose-950/40 text-rose-200";
                  } else {
                    cls = "border-slate-800 bg-slate-900/40 text-slate-500";
                  }
                }
                return (
                  <button
                    key={optKey}
                    type="button"
                    onClick={() => handleSelect(optIdx)}
                    className={`w-full flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs sm:text-sm transition ${cls}`}
                  >
                    <span>{t[optKey]}</span>
                    {selected !== null && isCorrect && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    {selected !== null && isChosen && !isCorrect && (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {selected !== null && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-xs text-cyan-200">
                {t[q.explanationKey]}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleNext}
                disabled={selected === null}
                className="rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 disabled:opacity-40 px-4 py-2 text-xs sm:text-sm font-bold text-slate-950 transition"
              >
                {t.quiz_next}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
