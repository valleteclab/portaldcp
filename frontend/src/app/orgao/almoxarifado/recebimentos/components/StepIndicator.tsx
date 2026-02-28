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
    <div className="flex items-center gap-0 bg-white border-b px-6 h-11">
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
                'flex items-center gap-2 px-4 h-11 text-sm font-medium transition-all border-b-2',
                isActive && 'border-blue-600 text-blue-700 font-bold',
                isCompleted && !isActive && 'border-transparent text-green-600 cursor-pointer hover:text-green-700',
                !isActive && !isCompleted && canNavigate && 'border-transparent text-gray-500 cursor-pointer hover:text-gray-700',
                !isActive && !isCompleted && !canNavigate && 'border-transparent text-gray-400 cursor-default',
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
