import React from 'react'
import { Text, View } from 'react-native'
import Toast, { BaseToastProps, ToastConfig } from 'react-native-toast-message'

// Custom toast configurations
export const toastConfig: ToastConfig = {
  success: ({ text1, text2 }: BaseToastProps) => (
    <View className="bg-success/90 border border-success rounded-xl mx-4 p-4">
      <Text className="text-white font-medium text-sm">{text1}</Text>
      {text2 && <Text className="text-white/90 text-xs mt-1">{text2}</Text>}
    </View>
  ),

  error: ({ text1, text2 }: BaseToastProps) => (
    <View className="bg-destructive/90 border border-destructive rounded-xl mx-4 p-4">
      <Text className="text-white font-medium text-sm">{text1}</Text>
      {text2 && <Text className="text-white/90 text-xs mt-1">{text2}</Text>}
    </View>
  ),

  info: ({ text1, text2 }: BaseToastProps) => (
    <View className="bg-primary/90 border border-primary rounded-xl mx-4 p-4">
      <Text className="text-white font-medium text-sm">{text1}</Text>
      {text2 && <Text className="text-white/90 text-xs mt-1">{text2}</Text>}
    </View>
  ),

  warning: ({ text1, text2 }: BaseToastProps) => (
    <View className="bg-warning/90 border border-warning rounded-xl mx-4 p-4">
      <Text className="text-white font-medium text-sm">{text1}</Text>
      {text2 && <Text className="text-white/90 text-xs mt-1">{text2}</Text>}
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
      autoHide: true,
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
      autoHide: true,
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
      autoHide: true,
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
      autoHide: true,
      topOffset: 60,
    })
  },
}
