import React from 'react'
import { Text, View } from 'react-native'
import { ErrorDetails } from '../types/errors'
import { getErrorSuggestions } from '../utils/errorUtils'

export interface ErrorDisplayProps {
  error: ErrorDetails
  onRetry?: () => void
  className?: string
  testID?: string
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry, className = '', testID }) => {
  const suggestions = getErrorSuggestions(error)

  return (
    <View className={`bg-destructive/10 p-4 rounded-xl border border-destructive/20 ${className}`} testID={testID}>
      <View className="flex-row items-center mb-2">
        <Text className="text-lg mr-2">⚠️</Text>
        <Text className="text-destructive font-medium text-sm flex-1">Error</Text>
      </View>

      <Text className="text-destructive text-sm mb-3">{error.message}</Text>

      {suggestions.length > 0 && (
        <View className="mb-3">
          <Text className="text-muted-foreground text-xs font-medium mb-1">Try these solutions:</Text>
          {suggestions.map((suggestion, index) => (
            <Text key={index} className="text-muted-foreground text-xs ml-3">
              • {suggestion}
            </Text>
          ))}
        </View>
      )}

      {onRetry && (
        <Text className="text-primary text-sm font-medium text-center mt-2" onPress={onRetry}>
          Try Again
        </Text>
      )}
    </View>
  )
}
