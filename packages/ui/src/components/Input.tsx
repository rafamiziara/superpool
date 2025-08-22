import React from 'react'
import { cn } from '../utils/cn'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'filled' | 'ghost'
  inputSize?: 'sm' | 'md' | 'lg'
  error?: boolean
  leftAddon?: React.ReactNode
  rightAddon?: React.ReactNode
}

const inputVariants = {
  default: 'border border-gray-300 bg-white focus:border-primary focus:ring-primary/20',
  filled: 'border-0 bg-gray-100 focus:bg-white focus:ring-primary/20',
  ghost: 'border-0 bg-transparent focus:bg-gray-50 focus:ring-primary/20',
}

const inputSizes = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-3 text-base',
  lg: 'px-5 py-4 text-lg',
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ 
    className, 
    variant = 'default',
    inputSize = 'md',
    error = false,
    leftAddon,
    rightAddon,
    ...props 
  }, ref) => {
    const inputElement = (
      <input
        className={cn(
          // Base styles
          'w-full rounded-lg font-primary transition-all duration-200',
          'placeholder:text-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-offset-1',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // Variant styles
          inputVariants[variant],
          // Size styles
          inputSizes[inputSize],
          // Error styles
          error && 'border-error focus:border-error focus:ring-error/20',
          // Adjust padding for addons
          leftAddon && 'pl-10',
          rightAddon && 'pr-10',
          className
        )}
        ref={ref}
        {...props}
      />
    )

    if (leftAddon || rightAddon) {
      return (
        <div className="relative">
          {leftAddon && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-400 text-sm">{leftAddon}</span>
            </div>
          )}
          {inputElement}
          {rightAddon && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <span className="text-gray-400 text-sm">{rightAddon}</span>
            </div>
          )}
        </div>
      )
    }

    return inputElement
  }
)

Input.displayName = 'Input'