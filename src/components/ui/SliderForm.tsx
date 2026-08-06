import { useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import ProgressWizard from './ProgressWizard';
import Button from './Button';

export interface SliderFormStep {
  label: string;
  title: string;
  subtitle?: string;
  content: ReactNode;
}

interface SliderFormProps {
  steps: SliderFormStep[];
  className?: string;
  onSubmit?: () => void;
  submitLabel?: string;
}

const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -300 : 300, opacity: 0 }),
};

export default function SliderForm({ steps, className = '', onSubmit, submitLabel = 'Submit' }: SliderFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);

  const isFirst = currentStep === 0;
  const isLast = currentStep === steps.length - 1;

  const goNext = () => {
    if (isLast) return;
    setDirection(1);
    setCurrentStep(prev => prev + 1);
  };

  const goPrev = () => {
    if (isFirst) return;
    setDirection(-1);
    setCurrentStep(prev => prev - 1);
  };

  return (
    <div className={className}>
      <ProgressWizard
        steps={steps.map((s, i) => ({ label: s.label, status: i < currentStep ? 'completed' : i === currentStep ? 'active' : 'pending' }))}
        currentStep={currentStep}
        className="mb-6"
      />

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25, ease: 'easeInOut' }}
        >
          <h3 className="text-sm font-semibold text-text-primary mb-1">{steps[currentStep].title}</h3>
          {steps[currentStep].subtitle && (
            <p className="text-xs text-text-muted mb-4">{steps[currentStep].subtitle}</p>
          )}
          <div className="space-y-4">
            {steps[currentStep].content}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-border-subtle flex-wrap gap-2">
        <div>
          {!isFirst && (
            <Button variant="ghost" size="sm" onClick={goPrev} className="w-full sm:w-auto">
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
          )}
        </div>
        {isLast ? (
          <Button onClick={onSubmit} className="w-full sm:w-auto min-h-[44px]">{submitLabel}</Button>
        ) : (
          <Button onClick={goNext} className="w-full sm:w-auto min-h-[44px]">
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
