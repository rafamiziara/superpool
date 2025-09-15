import React from 'react'
import { Text, View } from 'react-native'
import Toast, { BaseToastProps, ToastConfig } from 'react-native-toast-message'

// Custom toast configurations
export const toastConfig: ToastConfig = {
  success: ({ text1, text2 }: BaseToastProps) => (
    <View className="bg-success/10 border border-success/20 rounded-xl mx-4 p-4 flex-row items-center">
      <Text className="text-success text-lg mr-3">✅</Text>
      <View className="flex-1">
        <Text className="text-success font-medium text-sm">{text1}</Text>
        {text2 && <Text className="text-success/70 text-xs mt-1">{text2}</Text>}
      </View>
    </View>
  ),

  error: ({ text1, text2 }: BaseToastProps) => (
    <View className="bg-destructive/10 border border-destructive/20 rounded-xl mx-4 p-4 flex-row items-center">
      <Text className="text-destructive text-lg mr-3">❌</Text>
      <View className="flex-1">
        <Text className="text-destructive font-medium text-sm">{text1}</Text>
        {text2 && <Text className="text-destructive/70 text-xs mt-1">{text2}</Text>}
      </View>
    </View>
  ),

  info: ({ text1, text2 }: BaseToastProps) => (
    <View className="bg-primary/10 border border-primary/20 rounded-xl mx-4 p-4 flex-row items-center">
      <Text className="text-primary text-lg mr-3">ℹ️</Text>
      <View className="flex-1">
        <Text className="text-primary font-medium text-sm">{text1}</Text>
        {text2 && <Text className="text-primary/70 text-xs mt-1">{text2}</Text>}
      </View>
    </View>
  ),

  warning: ({ text1, text2 }: BaseToastProps) => (
    <View className="bg-warning/10 border border-warning/20 rounded-xl mx-4 p-4 flex-row items-center">
      <Text className="text-warning text-lg mr-3">⚠️</Text>
      <View className="flex-1">
        <Text className="text-warning font-medium text-sm">{text1}</Text>
        {text2 && <Text className="text-warning/70 text-xs mt-1">{text2}</Text>}
      </View>
    </View>
  ),
}

// Toast utility functions
export const showToast = {
  success: (title: string, message?: string) => {
    Toast.show({
      type: 'success',
      text1: title,
      text2: message,
      position: 'top',
      visibilityTime: 3000,
      topOffset: 60,
    })
  },

  error: (title: string, message?: string) => {
    Toast.show({
      type: 'error',
      text1: title,
      text2: message,
      position: 'top',
      visibilityTime: 4000,
      topOffset: 60,
    })
  },

  info: (title: string, message?: string) => {
    Toast.show({
      type: 'info',
      text1: title,
      text2: message,
      position: 'top',
      visibilityTime: 3000,
      topOffset: 60,
    })
  },

  warning: (title: string, message?: string) => {
    Toast.show({
      type: 'warning',
      text1: title,
      text2: message,
      position: 'top',
      visibilityTime: 3500,
      topOffset: 60,
    })
  },
}
