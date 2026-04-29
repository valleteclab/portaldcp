'use client'

import { cn } from '@/lib/utils'
import { Check, ChevronRight } from 'lucide-react'

interface Step {
  key: string
  label: string
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: string
  completedSteps: string[]
  onStepClick?: (step: string) => void
}

export function StepIndicator({ steps, currentStep, completedSteps, onStepClick }: StepIndicatorProps) {
  const currentIndex = steps.findIndex(s => s.key === currentStep)

  return (
    <div className="flex items-center gap-0 bg-white border-b border-[#d5deec] px-4 h-12 overflow-x-auto">
      {steps.map((step, i) => {
        const isActive = currentStep === step.key
        const isCompleted = completedSteps.includes(step.key)
        const canNavigate = isCompleted || i <= currentIndex
        return (
          <div key={step.key} className="flex items-center">
            <button
              onClick={() => canNavigate && onStepClick?.(step.key)}
              disabled={!canNavigate}
              className={cn(
                'flex items-center gap-2 px-6 h-12 whitespace-nowrap text-sm font-black transition-all border-b-2',
                isActive && 'border-[#123f82] text-[#123f82]',
                isCompleted && !isActive && 'border-transparent text-emerald-600 cursor-pointer hover:text-emerald-700',
                !isActive && !isCompleted && canNavigate && 'border-transparent text-slate-400 cursor-pointer hover:text-[#123f82]',
                !isActive && !isCompleted && !canNavigate && 'border-transparent text-slate-400 cursor-default',
              )}
            >
              {isCompleted && !isActive && <Check className="h-4 w-4" />}
              {step.label}
            </button>
            {i < steps.length - 1 && (
              <ChevronRight className="h-4 w-4 text-gray-300 mx-1" />
            )}
          </div>
        )
      })}
    </div>
  )
}
