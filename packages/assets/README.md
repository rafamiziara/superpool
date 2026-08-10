# SuperPool Assets

Shared brand assets for the SuperPool design system.

## 📁 Directory Structure

```
packages/assets/
├── images/
│   ├── logos/           # Brand logos (SVG, PNG formats)
│   ├── illustrations/   # Feature illustrations and graphics
│   └── icons/           # UI icons and symbols (coming soon)
└── fonts/              # Custom fonts (if any)
```

## 🖼️ Current Assets

### Feature Illustrations

Located in `images/illustrations/`:

- `feature_1.png` - Secure Wallet Authentication
- `feature_2.png` - Create & Join Lending Pools
- `feature_3.png` - Contribute & Borrow Funds
- `feature_4.png` - Multi-Sig Security

These illustrations showcase the four core features of SuperPool and are used across the platform - mobile onboarding, web landing page, and any other feature showcases.

## 🚀 SuperPool Features

The feature illustrations represent SuperPool's core capabilities:

### 1. 🔐 Secure Wallet Authentication (`feature_1.png`)

Connect with 100+ wallets including MetaMask, WalletConnect, and Coinbase. Secure signature-based login with no passwords required.

### 2. 🏊 Create & Join Lending Pools (`feature_2.png`)

Start your own micro-lending community or join existing pools. Each pool has its own members and lending parameters managed by administrators.

### 3. 💰 Contribute & Borrow Funds (`feature_3.png`)

Pool members can contribute POL to provide liquidity and request loans from their trusted community with AI-assisted approval.

### 4. 🛡️ Multi-Sig Security (`feature_4.png`)

Enhanced security through multi-signature wallet controls for all critical protocol actions, ensuring decentralized governance and protection.

## 🚀 Usage

### React Native (Mobile App)

```typescript
import { Image } from 'react-native'
import { illustrations } from '@superpool/assets'

// Use exported illustrations object
<Image source={illustrations.walletAuth} />

// Or import directly
const featureImage = require('@superpool/assets/images/illustrations/feature_1.png')
<Image source={featureImage} />
```

### Next.js (Landing Page)

```typescript
import Image from 'next/image'
import { imagePaths } from '@superpool/assets'

// Use exported image paths (recommended)
<Image src={imagePaths.illustrations.walletAuth} alt="Secure Wallet Authentication" />

// Or use direct paths (assets copied via prebuild script)
<Image src="/images/illustrations/feature_1.png" alt="Secure Wallet Authentication" />
```

## 📋 Asset Requirements

### Logos (Coming Soon)

- Primary logo (SVG, PNG)
- Logo mark/icon (square formats)
- Monochrome versions
- App icon sizes:
  - iOS: 20x20, 29x29, 40x40, 60x60, 76x76, 83.5x83.5, 1024x1024
  - Android: 48x48, 72x72, 96x96, 144x144, 192x192, 512x512

### Icons (Coming Soon)

- UI icon set (chevrons, close, menu, wallet, etc.)
- Sizes: 16x16, 24x24, 32x32
- Format: SVG preferred for scalability

### Additional Illustrations (Coming Soon)

- Empty state illustrations
- Error state graphics
- Loading animations
- Format: SVG or high-res PNG

## 🎨 Design Guidelines

All assets should follow the SuperPool design system:

- **Colors**: Use DeFi Blue palette (#2563eb, #06b6d4, #0f172a)
- **Style**: Clean, modern, professional
- **Format**: SVG for scalability, PNG for complex illustrations
- **Optimization**: Compress for web delivery

---

**Related**: See the [root README](../../README.md) for how the packages fit together.
