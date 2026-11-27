import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { QUIZ_QUESTIONS } from "../data/curriculum";
import type { TranslationDict } from "../i18n/translations";

interface QuizPageProps {
  t: TranslationDict;
  onBackToBoard: () => void;
  onOpenLessons: () => void;
}

export const QuizPage: React.FC<QuizPageProps> = ({
  t,
  onBackToBoard,
  onOpenLessons,
}) => {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [finished, setFinished] = useState(false);

  const total = QUIZ_QUESTIONS.length;
  const q = QUIZ_QUESTIONS[index];
  const selected = answers[index] ?? null;
  const score = QUIZ_QUESTIONS.reduce(
    (acc, item, i) => (answers[i] === item.correctIndex ? acc + 1 : acc),
    0
  );
  const answeredCount = Object.keys(answers).length;

  const handleSelect = (optIdx: number) => {
    if (answers[index] !== undefined) return;
    setAnswers((prev) => ({ ...prev, [index]: optIdx }));
  };

  const handleNext = () => {
    if (index + 1 < total) {
      setIndex((i) => i + 1);
    } else {
      setFinished(true);
    }
  };

  const handleRestart = () => {
    setIndex(0);
    setAnswers({});
    setFinished(false);
  };

  return (
    <div className="max-w-5xl w-full mx-auto px-4 py-6 space-y-5 flex-1">
      {/* Page Header */}
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
              <HelpCircle className="w-5 h-5 text-violet-400" />
              {t.quiz_title}
            </h2>
            <p className="text-xs text-slate-400">{t.quiz_page_subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-violet-500/40 bg-violet-500/15 px-3 py-1 text-xs font-mono text-violet-200">
            {t.quiz_score}: {score} / {total}
          </span>
          <button
            type="button"
            onClick={onOpenLessons}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition"
          >
            <BookOpen className="w-4 h-4" />
            {t.btn_lessons}
          </button>
        </div>
      </div>

      {finished ? (
        <div className="rounded-2xl border border-slate-800 bg-[#0F1629]/95 p-6 sm:p-8 space-y-6 shadow-2xl">
          <div className="text-center space-y-3 border-b border-slate-800 pb-6">
            <Award className="w-16 h-16 text-amber-400 mx-auto" />
            <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
              {t.quiz_score}: {score} / {total} ({Math.round((score / total) * 100)}%)
            </h3>
            <p className="text-sm text-slate-300 max-w-xl mx-auto">
              {score >= total - 1
                ? t.quiz_result_great
                : score >= Math.ceil(total / 2)
                  ? t.quiz_result_good
                  : t.quiz_result_review}
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleRestart}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 px-4 py-2 text-xs sm:text-sm font-bold text-slate-950 transition"
              >
                <RotateCcw className="w-4 h-4" />
                {t.quiz_restart}
              </button>
              <button
                type="button"
                onClick={onOpenLessons}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/15 px-4 py-2 text-xs sm:text-sm font-semibold text-cyan-200 hover:bg-cyan-500/25 transition"
              >
                <BookOpen className="w-4 h-4" />
                {t.btn_lessons}
              </button>
              <button
                type="button"
                onClick={onBackToBoard}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs sm:text-sm font-semibold text-slate-200 hover:bg-slate-800 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                {t.btn_back_to_board}
              </button>
            </div>
          </div>

          {/* Full Answer Review */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              {t.quiz_review_heading}
            </h4>
            {QUIZ_QUESTIONS.map((item, i) => {
              const chosen = answers[i];
              const ok = chosen === item.correctIndex;
              return (
                <div
                  key={item.id}
                  className={`rounded-xl border p-4 space-y-1.5 ${
                    ok
                      ? "border-emerald-500/35 bg-emerald-950/15"
                      : "border-rose-500/35 bg-rose-950/15"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono font-bold text-slate-400">
                      Q{i + 1} · {item.topic}
                    </span>
                    {ok ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                        <CheckCircle2 className="w-4 h-4" />
                        Correct
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-300">
                        <XCircle className="w-4 h-4" />
                        Needs Review
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-100">
                    {t[item.questionKey]}
                  </p>
                  <p className="text-xs text-emerald-200/90">
                    Answer: {t[item.optionKeys[item.correctIndex]]}
                  </p>
                  <p className="text-xs text-slate-300">{t[item.explanationKey]}</p>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-[#0F1629]/95 p-5 sm:p-7 space-y-6 shadow-2xl">
          {/* Progress Stepper */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span className="rounded-md border border-violet-500/35 bg-violet-500/10 px-2.5 py-0.5 font-mono text-violet-200">
                {q.topic}
              </span>
              <span className="font-mono">
                Question {index + 1} / {total} ({answeredCount} answered)
              </span>
            </div>
            <div className="grid grid-cols-8 gap-1.5">
              {QUIZ_QUESTIONS.map((item, i) => {
                const ans = answers[i];
                const isCur = i === index;
                let barCls = "bg-slate-800 hover:bg-slate-700";
                if (ans !== undefined) {
                  barCls = ans === item.correctIndex ? "bg-emerald-500" : "bg-rose-500";
                } else if (isCur) {
                  barCls = "bg-cyan-400";
                }
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    className={`h-2.5 rounded-full transition ${barCls} ${
                      isCur ? "ring-2 ring-white/50" : ""
                    }`}
                    title={`Question ${i + 1}: ${item.topic}`}
                  />
                );
              })}
            </div>
          </div>

          <p className="text-base sm:text-xl font-bold text-slate-100 leading-relaxed">
            {t[q.questionKey]}
          </p>

          {/* Beginner Helpful Tip */}
          <div className="rounded-xl border border-amber-500/25 bg-amber-950/15 px-3.5 py-2.5 flex items-start gap-2 text-xs text-amber-200/90">
            <Lightbulb className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
            <span>
              <strong>Hint:</strong> {t[q.tipKey]}
            </span>
          </div>

          {/* Options */}
          <div className="space-y-2.5">
            {q.optionKeys.map((optKey, optIdx) => {
              const isChosen = selected === optIdx;
              const isCorrect = optIdx === q.correctIndex;
              let cls =
                "border-slate-700 bg-slate-900/80 text-slate-200 hover:border-cyan-400/70 hover:bg-slate-800/80";
              if (selected !== null) {
                if (isCorrect) {
                  cls = "border-emerald-400 bg-emerald-950/40 text-emerald-100 ring-1 ring-emerald-400/40";
                } else if (isChosen) {
                  cls = "border-rose-400 bg-rose-950/40 text-rose-100";
                } else {
                  cls = "border-slate-800 bg-slate-900/40 text-slate-500";
                }
              }
              return (
                <button
                  key={optKey}
                  type="button"
                  onClick={() => handleSelect(optIdx)}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-xs sm:text-sm font-medium transition ${cls}`}
                >
                  <span>
                    <span className="font-mono font-bold mr-2 text-slate-400">
                      {String.fromCharCode(65 + optIdx)}.
                    </span>
                    {t[optKey]}
                  </span>
                  {selected !== null && isCorrect && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  )}
                  {selected !== null && isChosen && !isCorrect && (
                    <XCircle className="w-5 h-5 text-rose-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {selected !== null && (
            <div className="rounded-xl border border-cyan-500/35 bg-cyan-950/25 p-4 text-xs sm:text-sm text-cyan-100 leading-relaxed">
              <div className="font-bold text-cyan-300 mb-1">Why this works:</div>
              {t[q.explanationKey]}
            </div>
          )}

          {/* Footer Navigation */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 hover:border-slate-500 disabled:opacity-40 px-3.5 py-2 text-xs font-semibold text-slate-200 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t.btn_prev_module}
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={selected === null}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-400 disabled:opacity-40 px-5 py-2 text-xs sm:text-sm font-bold text-slate-950 transition"
            >
              {index + 1 < total ? t.quiz_next : t.btn_finish_quiz}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
