import React from 'react';
import { View } from 'react-native';

interface ProgressIndicatorProps {
  totalSteps: number;
  currentStep: number;
  className?: string;
}

export function ProgressIndicator({ totalSteps, currentStep, className = '' }: ProgressIndicatorProps) {
  return (
    <View className={`flex-row justify-center items-center gap-2 ${className}`}>
      {Array.from({ length: totalSteps }, (_, index) => (
        <View
          key={index}
          className={`w-2 h-2 rounded-full ${
            index === currentStep
              ? 'bg-primary'
              : 'bg-muted-foreground/30'
          }`}
        />
      ))}
    </View>
  );
}