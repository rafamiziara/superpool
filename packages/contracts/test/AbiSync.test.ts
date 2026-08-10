import { expect } from 'chai'
import * as fs from 'fs'
import { artifacts } from 'hardhat'
import * as path from 'path'
import { ABI_CONTRACTS, ABI_OUTPUT_FILES, REGENERATE_COMMAND, renderAbiModule, RenderedAbi, REPO_ROOT } from '../scripts/abi-codegen'

/**
 * Guards the consumers' ABI copies against drift.
 *
 * The comparison is on the full rendered module, so it covers input and output
 * types, argument order, and `indexed` flags. Comparing selectors alone would
 * not: of the five drift bugs that motivated this test, only one changed a
 * function's selector — the others reordered a struct's fields or dropped an
 * `indexed` flag, both invisible to a sighash check and both enough to make the
 * backend decode a pool incorrectly.
 */
/**
 * Chai truncates its diff of a ~1900-line module to an ellipsis, which says
 * nothing about what changed. Report the first differing line instead.
 */
function describeFirstDifference(actual: string, expected: string): string {
  const actualLines = actual.split('\n')
  const expectedLines = expected.split('\n')
  const index = actualLines.findIndex((line, i) => line !== expectedLines[i])

  if (index === -1) {
    return `file is ${actualLines.length} lines, expected ${expectedLines.length}`
  }

  return `first difference on line ${index + 1}:\n  in file:     ${actualLines[index]}\n  from artifact: ${expectedLines[index] ?? '<end of file>'}`
}

describe('ABI sync', function () {
  let expectedModule: string

  before(async function () {
    const abis: RenderedAbi[] = []

    for (const { contractName, exportName } of ABI_CONTRACTS) {
      const artifact = await artifacts.readArtifact(contractName)
      abis.push({ exportName, abi: artifact.abi })
    }

    expectedModule = renderAbiModule(abis)
  })

  for (const outputFile of ABI_OUTPUT_FILES) {
    describe(outputFile, function () {
      it('exists', function () {
        expect(fs.existsSync(path.join(REPO_ROOT, outputFile)), `${outputFile} is missing — run \`${REGENERATE_COMMAND}\``).to.equal(true)
      })

      it('matches the compiled artifacts', function () {
        const actual = fs.readFileSync(path.join(REPO_ROOT, outputFile), 'utf8')

        if (actual !== expectedModule) {
          expect.fail(
            `${outputFile} has drifted from the compiled contracts — run \`${REGENERATE_COMMAND}\`\n${describeFirstDifference(actual, expectedModule)}`
          )
        }
      })
    })
  }

  it('keeps every consumer byte-identical', function () {
    const contents = ABI_OUTPUT_FILES.map((outputFile) => fs.readFileSync(path.join(REPO_ROOT, outputFile), 'utf8'))

    for (const [index, copy] of contents.entries()) {
      if (copy !== contents[0]) {
        expect.fail(
          `${ABI_OUTPUT_FILES[index]} disagrees with ${ABI_OUTPUT_FILES[0]} — run \`${REGENERATE_COMMAND}\`\n${describeFirstDifference(copy, contents[0])}`
        )
      }
    }
  })
})
