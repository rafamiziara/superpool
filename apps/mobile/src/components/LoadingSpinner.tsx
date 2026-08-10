import React from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { palette } from '../constants/palette'

export interface LoadingSpinnerProps {
  size?: 'small' | 'large'
  color?: string
  className?: string
  showText?: boolean
  text?: string
  testID?: string
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'large',
  color = palette.mint, // Primary action colour of the dark theme
  className = '',
  showText = false,
  text = 'Loading...',
  testID = 'loading-spinner',
}) => {
  const containerSize = size === 'large' ? 'w-16 h-16' : 'w-6 h-6'
  const spinnerSize = size === 'large' ? 'large' : 'small'
  const textSize = size === 'large' ? 'text-sm' : 'text-xs'

  return (
    <View className={`items-center justify-center ${containerSize} ${className}`} testID={testID}>
      <ActivityIndicator size={spinnerSize} color={color} testID={`${testID}-indicator`} />
      {showText && (
        <Text className={`text-fog ${textSize} mt-2 text-center`} testID={`${testID}-text`}>
          {text}
        </Text>
      )}
    </View>
  )
}

// Preset variants for common use cases
export const LoadingSpinnerVariants = {
  small: (props?: Partial<LoadingSpinnerProps>) => <LoadingSpinner size="small" {...props} />,
  large: (props?: Partial<LoadingSpinnerProps>) => <LoadingSpinner size="large" {...props} />,
  withText: (text: string, props?: Partial<LoadingSpinnerProps>) => <LoadingSpinner showText text={text} {...props} />,
  primary: (props?: Partial<LoadingSpinnerProps>) => <LoadingSpinner color={palette.mint} {...props} />,
  muted: (props?: Partial<LoadingSpinnerProps>) => <LoadingSpinner color={palette.mist} {...props} />,
}
