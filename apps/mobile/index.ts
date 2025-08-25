import './global.css'

// Configure MobX for React Native before any stores are imported
import { configureMobX } from './src/stores/mobxConfig'
configureMobX()

import 'expo-router/entry'
