import React from 'react';
import { Sparkles, BookOpen, ShieldCheck, ArrowRight, X } from 'lucide-react';
import { Wordmark, AppIcon } from '@snapsort/ui';
import { useOnboardingStore } from '../stores/useOnboardingStore';
import { useDelayedUnmount } from '../utils/useDelayedUnmount';

export interface WelcomeModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onStartTour?: () => void;
  onOpenTutorial?: () => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  onClose,
  onStartTour,
  onOpenTutorial,
}) => {
  const store = useOnboardingStore();
  const effectiveOpen = isOpen !== undefined ? isOpen : store.welcomeOpen;
  const handleClose = onClose || store.closeWelcome;
  const handleStartTour = onStartTour || (() => store.startTour(0));
  const handleOpenTutorial = onOpenTutorial || (() => store.openTutorialDrawer('interact'));
  const mounted = useDelayedUnmount(effectiveOpen, 150);

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md ${
        effectiveOpen ? 'animate-in fade-in duration-200' : 'animate-out fade-out duration-150 pointer-events-none'
      }`}
    >
      <div
        className={`relative w-full max-w-lg bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl p-7 shadow-2xl overflow-hidden ${
          effectiveOpen ? 'animate-in zoom-in-95 slide-in-from-bottom-2 duration-200' : 'animate-out zoom-out-95 duration-150'
        }`}
      >
        {/* Amber Ambient Glow */}
        <div
          className="absolute -top-24 -left-24 w-64 h-64 pointer-events-none rounded-full opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(255, 196, 0, 0.4) 0%, transparent 70%)',
          }}
        />

        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close welcome modal"
          className="absolute top-4 right-4 p-1.5 rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        {/* Header with AppIcon & Wordmark */}
        <div className="flex items-center gap-3 mb-5">
          <AppIcon size={44} className="rounded-xl shadow-md shrink-0" />
          <div>
            <Wordmark size="sm" />
            <p className="text-[11px] text-[var(--text-muted)] font-medium mt-0.5">
              Intelligent Local Media Studio
            </p>
          </div>
        </div>

        {/* Title & Description */}
        <h2 id="welcome-modal-title" className="text-xl font-bold text-[var(--text)] tracking-tight">
          Find any clip or photo in seconds.
        </h2>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-2">
          Snapsort brings intelligent neural search, facial recognition, and automated video scene
          detection directly to your local hardware. Everything runs on-device with zero cloud calls.
        </p>

        {/* Core Pillars */}
        <div className="grid grid-cols-3 gap-2.5 my-5">
          <div className="bg-[var(--surface-2)]/70 border border-[var(--border)] rounded-xl p-2.5 text-center">
            <ShieldCheck size={16} className="text-[var(--success)] mx-auto mb-1.5" />
            <div className="text-[11px] font-semibold text-[var(--text)]">100% Private</div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5">Zero cloud telemetry</div>
          </div>
          <div className="bg-[var(--surface-2)]/70 border border-[var(--border)] rounded-xl p-2.5 text-center">
            <Sparkles size={16} className="text-[var(--accent)] mx-auto mb-1.5" />
            <div className="text-[11px] font-semibold text-[var(--text)]">Neural Search</div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5">Visual & natural language</div>
          </div>
          <div className="bg-[var(--surface-2)]/70 border border-[var(--border)] rounded-xl p-2.5 text-center">
            <div className="text-xs font-mono font-bold text-[var(--accent)] mb-1.5">M-SERIES</div>
            <div className="text-[11px] font-semibold text-[var(--text)]">Local Silicon</div>
            <div className="text-[9px] text-[var(--text-muted)] mt-0.5">Native hardware speed</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 mt-6">
          <button
            type="button"
            onClick={handleStartTour}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--accent)] text-[var(--accent-ink)] font-bold text-xs hover:brightness-105 active:scale-[0.99] transition-all shadow-md cursor-pointer"
          >
            <Sparkles size={14} />
            <span>Start Interactive Tour (1 min)</span>
            <ArrowRight size={14} className="ml-0.5" />
          </button>

          <button
            type="button"
            onClick={handleOpenTutorial}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--border-focus)] font-semibold text-xs active:scale-[0.99] transition-all cursor-pointer"
          >
            <BookOpen size={14} className="text-[var(--text-muted)]" />
            <span>Open Tutorial Guide & Shortcuts</span>
          </button>

          <div className="text-center mt-1">
            <button
              type="button"
              onClick={handleClose}
              className="text-[11px] text-[var(--text-dim)] hover:text-[var(--text-muted)] transition-colors underline cursor-pointer"
            >
              Skip and explore on my own
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
