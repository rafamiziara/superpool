import * as fs from 'fs'
import { artifacts } from 'hardhat'
import * as path from 'path'
import { ABI_CONTRACTS, ABI_OUTPUT_FILES, renderAbiModule, RenderedAbi, REPO_ROOT } from './abi-codegen'

/**
 * Regenerates the shared ABI module from the compiled contract artifacts.
 * Run with: pnpm --filter contracts abis:generate
 */
async function main() {
  const abis: RenderedAbi[] = []

  for (const { contractName, exportName } of ABI_CONTRACTS) {
    const artifact = await artifacts.readArtifact(contractName)
    abis.push({ exportName, abi: artifact.abi })
    console.log(`Read ${contractName} — ${artifact.abi.length} ABI entries`)
  }

  const contents = renderAbiModule(abis)

  for (const outputFile of ABI_OUTPUT_FILES) {
    const absolutePath = path.join(REPO_ROOT, outputFile)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, contents, 'utf8')
    console.log(`Wrote ${outputFile}`)
  }

  console.log('✅ ABIs generated')
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
