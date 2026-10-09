import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Sparkles, ArrowRight, ArrowLeft, X, Check } from 'lucide-react';
import { useOnboardingStore, TOUR_STEPS, SingleSpotlightInfo } from '../stores/useOnboardingStore';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface SpotlightTourOverlayProps {
  isActive?: boolean;
  stepIndex?: number;
  singleInfo?: SingleSpotlightInfo | null;
  onNext?: () => void;
  onPrev?: () => void;
  onEnd?: () => void;
}

export const SpotlightTourOverlay: React.FC<SpotlightTourOverlayProps> = ({
  isActive,
  stepIndex,
  singleInfo,
  onNext,
  onPrev,
  onEnd,
}) => {
  const store = useOnboardingStore();

  const effectiveSingle = singleInfo !== undefined ? singleInfo : store.singleSpotlight;
  const isSingle = effectiveSingle !== null;
  const effectiveActive =
    isActive !== undefined ? isActive : store.tourActive || isSingle;
  const effectiveStepIndex = stepIndex !== undefined ? stepIndex : store.currentStepIndex;

  const handleNext = onNext || store.nextTourStep;
  const handlePrev = onPrev || store.prevTourStep;
  const handleEnd = onEnd || store.endTour;
  const handleClearSingle = onEnd || store.clearSingleSpotlight;

  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  const active = effectiveActive;

  const currentStep = useMemo(() => {
    if (isSingle && effectiveSingle) {
      return {
        id: 'single',
        targetSelector: effectiveSingle.selector,
        title: effectiveSingle.title,
        description: effectiveSingle.description,
        shortcut: effectiveSingle.shortcut,
        placement: 'bottom' as const,
      };
    }
    return TOUR_STEPS[effectiveStepIndex] || null;
  }, [isSingle, effectiveSingle, effectiveStepIndex]);

  // Update target rect
  const updateRect = useCallback(() => {
    if (!currentStep) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(currentStep.targetSelector);
    if (el) {
      const r = el.getBoundingClientRect();
      const padding = 6;
      setTargetRect({
        top: Math.max(4, r.top - padding),
        left: Math.max(4, r.left - padding),
        width: r.width + padding * 2,
        height: r.height + padding * 2,
      });
    } else {
      setTargetRect(null);
    }
  }, [currentStep]);

  useEffect(() => {
    if (!active) {
      setTargetRect(null);
      return;
    }

    updateRect();

    // Listen for resize & scroll
    window.addEventListener('resize', updateRect);
    window.addEventListener('scroll', updateRect, true);

    // Also small timeout in case element layout settles
    const timer = setTimeout(updateRect, 100);

    return () => {
      window.removeEventListener('resize', updateRect);
      window.removeEventListener('scroll', updateRect, true);
      clearTimeout(timer);
    };
  }, [active, updateRect]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isSingle) {
          handleClearSingle();
        } else {
          handleEnd();
        }
      } else if (!isSingle && (e.key === 'ArrowRight' || e.key === 'Enter')) {
        e.preventDefault();
        handleNext();
      } else if (!isSingle && e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, isSingle, handleNext, handlePrev, handleEnd, handleClearSingle]);

  if (!active || !currentStep) return null;

  const totalSteps = TOUR_STEPS.length;
  const isLastStep = effectiveStepIndex === totalSteps - 1;

  // Compute tooltip position
  const getTooltipStyle = () => {
    if (!targetRect) {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const tooltipWidth = 340;
    const tooltipEstimatedHeight = 200;
    const margin = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = targetRect.top + targetRect.height + margin;
    let left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;

    // If bottom overflow, place above target
    if (top + tooltipEstimatedHeight > viewportHeight - margin) {
      top = Math.max(margin, targetRect.top - tooltipEstimatedHeight - margin);
    }

    // Horizontal clamp
    if (left + tooltipWidth > viewportWidth - margin) {
      left = viewportWidth - tooltipWidth - margin;
    }
    if (left < margin) {
      left = margin;
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      width: `${tooltipWidth}px`,
    };
  };

  const handleFinish = () => {
    handleEnd();
    // Prompt opening the tutorial drawer if user finished all steps
    if (isLastStep) {
      store.openTutorialDrawer('shortcuts');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden select-none pointer-events-auto"
      aria-label="Interface Spotlight Tour"
    >
      {/* Target Cutout Ring with Deep Obsidian Backdrop Box Shadow */}
      {targetRect && (
        <div
          className="absolute rounded-xl transition-all duration-300 ease-out pointer-events-none"
          style={{
            top: `${targetRect.top}px`,
            left: `${targetRect.left}px`,
            width: `${targetRect.width}px`,
            height: `${targetRect.height}px`,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.72), 0 0 24px rgba(255, 196, 0, 0.45)',
            border: '2px solid var(--accent)',
          }}
        />
      )}

      {/* Floating Tooltip Card */}
      <div
        className="fixed z-50 bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl p-5 shadow-2xl transition-all duration-300 pointer-events-auto animate-in fade-in zoom-in-95"
        style={getTooltipStyle()}
      >
        {/* Amber Ambient Edge */}
        <div
          className="absolute -top-10 -right-10 w-28 h-28 pointer-events-none rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(255, 196, 0, 0.5) 0%, transparent 70%)',
          }}
        />

        {/* Top Meta Bar */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            {!isSingle ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--surface-3)] text-[var(--accent)] border border-[var(--accent-subtle)] tabular-nums">
                Step {effectiveStepIndex + 1} of {totalSteps}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--surface-3)] text-[var(--accent)] border border-[var(--accent-subtle)]">
                Spotlight
              </span>
            )}
            {currentStep.shortcut && (
              <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[var(--surface-2)] text-[var(--text-muted)] border border-[var(--border)]">
                {currentStep.shortcut}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={isSingle ? handleClearSingle : handleEnd}
            aria-label="Close tour"
            className="p-1 rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Step Title & Description */}
        <h3 className="text-sm font-bold text-[var(--text)] tracking-tight">
          {currentStep.title}
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-1.5 leading-relaxed">
          {currentStep.description}
        </p>

        {/* Footer Navigation */}
        <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-[var(--border-subtle)]">
          {!isSingle ? (
            <>
              <button
                type="button"
                onClick={handleEnd}
                className="text-xs text-[var(--text-dim)] hover:text-[var(--text)] transition-colors cursor-pointer"
              >
                Skip tour
              </button>

              <div className="flex items-center gap-2">
                {effectiveStepIndex > 0 && (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text)] text-xs font-semibold border border-[var(--border)] transition-colors cursor-pointer"
                  >
                    <ArrowLeft size={12} />
                    <span>Back</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={isLastStep ? handleFinish : handleNext}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] text-xs font-bold hover:brightness-105 transition-all shadow cursor-pointer"
                >
                  <span>{isLastStep ? 'Finish & Shortcuts' : 'Next'}</span>
                  {!isLastStep ? <ArrowRight size={13} /> : <Check size={13} />}
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex items-center justify-between">
              <button
                type="button"
                onClick={() => store.openTutorialDrawer('buttons')}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors cursor-pointer"
              >
                Back to Directory
              </button>
              <button
                type="button"
                onClick={handleClearSingle}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-[var(--accent-ink)] text-xs font-bold hover:brightness-105 transition-all cursor-pointer"
              >
                <Check size={12} />
                <span>Got it</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
