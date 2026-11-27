import React from "react";
import { CheckCircle2, Clock, History, Play, Trash2, X } from "lucide-react";
import type { TranslationDict } from "../i18n/translations";
import type { SessionGameRecord } from "../types/quantum";

interface SessionGamesModalProps {
  open: boolean;
  onClose: () => void;
  t: TranslationDict;
  games: SessionGameRecord[];
  activePuzzleId: string | undefined;
  onResumeGame: (record: SessionGameRecord) => void;
  onDeleteGame: (puzzleId: string) => void;
  onClearAll: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const SessionGamesModal: React.FC<SessionGamesModalProps> = ({
  open,
  onClose,
  t,
  games,
  activePuzzleId,
  onResumeGame,
  onDeleteGame,
  onClearAll,
}) => {
  if (!open) return null;

  const sorted = [...games].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-[#0F1629] p-5 sm:p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-bold text-slate-100">
              {t.session_games_title} ({sorted.length})
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {sorted.length > 0 && (
              <button
                type="button"
                onClick={onClearAll}
                className="text-xs text-rose-300 hover:text-rose-200 px-2 py-1 rounded border border-rose-500/30 bg-rose-950/20"
              >
                {t.session_clear_all}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400">{t.session_games_subtitle}</p>

        <div className="space-y-2.5 overflow-y-auto pr-1 flex-1">
          {sorted.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-8">
              {t.session_empty}
            </p>
          ) : (
            sorted.map((rec) => {
              const size = rec.puzzle.grid_size ?? rec.board.length;
              const filled = rec.board.flat().filter((v) => v !== 0).length;
              const isCurrent = rec.puzzle.id === activePuzzleId;
              const title = rec.puzzle.customTitle ?? t[rec.puzzle.title_key] ?? rec.puzzle.id;
              return (
                <div
                  key={rec.puzzle.id}
                  className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
                    isCurrent
                      ? "border-cyan-400/60 bg-cyan-950/20"
                      : "border-slate-800 bg-slate-900/75"
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-100 truncate">
                        {title}
                      </span>
                      <span className="rounded bg-cyan-500/15 border border-cyan-500/30 px-1.5 py-0.5 text-[10px] font-mono text-cyan-200">
                        {size}×{size}{size === 16 ? " Hex" : ""}
                      </span>
                      {rec.puzzle.isCustom && (
                        <span className="rounded bg-violet-500/20 border border-violet-500/40 px-1.5 py-0.5 text-[10px] font-mono text-violet-200">
                          Custom
                        </span>
                      )}
                      {rec.solved && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/20 border border-emerald-500/40 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                          <CheckCircle2 className="w-3 h-3" />
                          Solved
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                      <span>{filled}/{size * size} cells</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDuration(rec.elapsedSeconds)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onResumeGame(rec);
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 px-2.5 py-1.5 text-xs font-semibold text-cyan-200 transition"
                    >
                      <Play className="w-3.5 h-3.5" />
                      {isCurrent ? t.session_active : t.session_resume}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteGame(rec.puzzle.id)}
                      className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 hover:border-rose-400 hover:text-rose-300 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
