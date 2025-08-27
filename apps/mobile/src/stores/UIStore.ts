import { action, makeAutoObservable } from 'mobx'

/**
 * MobX store for managing UI-specific state across components
 * Centralizes component-level state that doesn't belong in domain stores
 */
export class UIStore {
  // Onboarding carousel state
  onboardingCurrentIndex: number = 0

  constructor() {
    makeAutoObservable(this, {
      // Explicitly mark actions
      setOnboardingIndex: action,
      resetOnboardingState: action,
    })
  }

  // Onboarding Actions
  setOnboardingIndex = (index: number): void => {
    console.log(`📱 UIStore.setOnboardingIndex: ${index}`)
    this.onboardingCurrentIndex = Math.max(0, index)
  }

  resetOnboardingState = (): void => {
    console.log('🔄 UIStore.resetOnboardingState called')
    this.onboardingCurrentIndex = 0
  }

  // Computed getters
  get currentOnboardingSlide(): number {
    return this.onboardingCurrentIndex
  }
}