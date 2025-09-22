import { AppKitButton } from '@reown/appkit-wagmi-react-native'
import { StatusBar } from 'expo-status-bar'
import { observer } from 'mobx-react-lite'
import React from 'react'
import { Alert, ScrollView, Text, View } from 'react-native'
import { authStore } from '../../src/stores/AuthStore'

function DashboardScreen() {
  const { walletAddress, chainId, isWalletConnected } = authStore

  const handlePoolAction = (action: string) => {
    Alert.alert('Pool Action', `${action} functionality will be available in the next phase.`, [{ text: 'OK' }])
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20 }} testID="dashboard-screen">
      <StatusBar style="auto" />

      {/* Header Section */}
      <View className="mb-8" testID="dashboard-header">
        <Text className="text-3xl font-extrabold text-primary mb-2" testID="welcome-title" accessibilityRole="header">
          Welcome to SUPERPOOL!
        </Text>
        <Text className="text-base text-muted-foreground" testID="welcome-subtitle">
          Your decentralized lending platform is ready
        </Text>
      </View>

      {/* User Info Section */}
      <View className="mb-8" testID="user-info-section">
        <View className="bg-surface p-4 rounded-xl border border-muted/20">
          <Text className="text-lg font-semibold text-foreground mb-3" testID="user-info-title" accessibilityRole="header">
            Account Information
          </Text>

          <View className="space-y-3">
            <View testID="wallet-address-info">
              <Text className="text-sm font-medium text-muted-foreground">Wallet Address</Text>
              <Text className="text-sm text-foreground font-mono" testID="wallet-address-value" selectable>
                {walletAddress || 'Not connected'}
              </Text>
            </View>

            <View testID="network-info">
              <Text className="text-sm font-medium text-muted-foreground">Network</Text>
              <View className="flex-row items-center">
                <View
                  className={`w-2 h-2 rounded-full mr-2 ${isWalletConnected ? 'bg-success' : 'bg-destructive'}`}
                  testID="connection-status-dot"
                />
                <Text className="text-sm text-foreground" testID="network-info-value">
                  {chainId ? `Chain ID: ${chainId}` : 'Not connected'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Wallet Management Section */}
      <View className="mb-8" testID="wallet-management-section">
        <Text className="text-lg font-semibold text-foreground mb-4" testID="wallet-management-title" accessibilityRole="header">
          Wallet Management
        </Text>

        <View className="bg-surface p-4 rounded-xl border border-muted/20">
          <Text className="text-sm text-muted-foreground mb-4">Manage your wallet connection and view account details</Text>

          <AppKitButton
            balance="show"
            size="md"
            connectStyle={{
              alignSelf: 'stretch',
              marginBottom: 12,
              borderRadius: 8,
            }}
          />

          <Text className="text-xs text-muted-foreground text-center">Click to view account details, switch networks, or disconnect</Text>
        </View>
      </View>

      {/* Quick Actions Section */}
      <View className="mb-8" testID="quick-actions-section">
        <Text className="text-lg font-semibold text-foreground mb-4" testID="quick-actions-title" accessibilityRole="header">
          Quick Actions
        </Text>

        <View className="space-y-3">
          {/* Create Pool Action */}
          <View className="bg-primary/5 p-4 rounded-xl border border-primary/20" testID="create-pool-action">
            <View className="flex-row items-center mb-2">
              <Text className="text-2xl mr-3">🏊</Text>
              <Text className="text-base font-medium text-foreground flex-1">Create Lending Pool</Text>
            </View>
            <Text className="text-sm text-muted-foreground mb-3">Start your own micro-lending community with custom parameters</Text>
            <Text
              className="text-primary font-medium text-sm"
              onPress={() => handlePoolAction('Create Pool')}
              testID="create-pool-button"
              accessibilityRole="button"
            >
              Coming Soon →
            </Text>
          </View>

          {/* Join Pool Action */}
          <View className="bg-secondary/5 p-4 rounded-xl border border-secondary/20" testID="join-pool-action">
            <View className="flex-row items-center mb-2">
              <Text className="text-2xl mr-3">👥</Text>
              <Text className="text-base font-medium text-foreground flex-1">Join Lending Pool</Text>
            </View>
            <Text className="text-sm text-muted-foreground mb-3">Browse and join existing lending pools in your community</Text>
            <Text
              className="text-secondary font-medium text-sm"
              onPress={() => handlePoolAction('Join Pool')}
              testID="join-pool-button"
              accessibilityRole="button"
            >
              Coming Soon →
            </Text>
          </View>

          {/* Portfolio Action */}
          <View className="bg-accent/5 p-4 rounded-xl border border-accent/20" testID="portfolio-action">
            <View className="flex-row items-center mb-2">
              <Text className="text-2xl mr-3">📊</Text>
              <Text className="text-base font-medium text-foreground flex-1">View Portfolio</Text>
            </View>
            <Text className="text-sm text-muted-foreground mb-3">Track your contributions, loans, and earnings across all pools</Text>
            <Text
              className="text-accent font-medium text-sm"
              onPress={() => handlePoolAction('View Portfolio')}
              testID="portfolio-button"
              accessibilityRole="button"
            >
              Coming Soon →
            </Text>
          </View>
        </View>
      </View>

      {/* Status Section */}
      <View className="mb-6" testID="status-section">
        <View className="bg-success/5 p-4 rounded-xl border border-success/20">
          <View className="flex-row items-center">
            <Text className="text-success text-lg mr-3">✅</Text>
            <View className="flex-1">
              <Text className="text-success font-medium text-sm">Authentication Successful</Text>
              <Text className="text-success/70 text-xs mt-1">Your wallet is connected and you're ready to use SUPERPOOL</Text>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  )
}

export default observer(DashboardScreen)
