import React from 'react';
import { ActivityIndicator, View } from 'react-native';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  className?: string;
  color?: string;
}

export function LoadingSpinner({ 
  size = 'large', 
  className = '', 
  color = '#2563eb' // Default to primary color
}: LoadingSpinnerProps) {
  return (
    <View className={`items-center justify-center ${className}`}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}