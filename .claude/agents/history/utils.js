#!/usr/bin/env node

/**
 * Agent History Utilities
 * Tools for working with JSON-format agent history files
 */

const fs = require('fs')
const path = require('path')

class AgentHistoryUtils {
  constructor(historyDir = __dirname) {
    this.historyDir = historyDir
  }

  /**
   * Read and parse agent history file
   * @param {string} agentName - Name of the agent
   * @returns {Object} Parsed history data
   */
  readHistory(agentName) {
    const filePath = path.join(this.historyDir, `${agentName}.json`)

    if (!fs.existsSync(filePath)) {
      return { agent: agentName, entries: [] }
    }

    try {
      const data = fs.readFileSync(filePath, 'utf8')
      return JSON.parse(data)
    } catch (error) {
      console.error(`Error reading history for ${agentName}:`, error)
      return { agent: agentName, entries: [] }
    }
  }

  /**
   * Query history entries with filters
   * @param {string} agentName - Name of the agent
   * @param {Object} filters - Filter criteria
   * @returns {Array} Filtered entries
   */
  queryHistory(agentName, filters = {}) {
    const history = this.readHistory(agentName)
    let entries = history.entries || []

    // Filter by package
    if (filters.package) {
      entries = entries.filter((entry) => entry.context.package?.includes(filters.package))
    }

    // Filter by task type
    if (filters.taskType) {
      entries = entries.filter((entry) => entry.task.type === filters.taskType)
    }

    // Filter by status
    if (filters.status) {
      entries = entries.filter((entry) => entry.outcome.status === filters.status)
    }

    // Filter by date range
    if (filters.since) {
      const sinceDate = new Date(filters.since)
      entries = entries.filter((entry) => new Date(entry.timestamp) >= sinceDate)
    }

    // Filter by tags
    if (filters.tag) {
      entries = entries.filter((entry) => entry.task.tags?.includes(filters.tag))
    }

    return entries
  }

  /**
   * Generate markdown summary from JSON history
   * @param {string} agentName - Name of the agent
   * @returns {string} Markdown formatted summary
   */
  generateMarkdownSummary(agentName) {
    const history = this.readHistory(agentName)

    let markdown = `# ${history.agent} Agent History\n\n`

    if (!history.entries || history.entries.length === 0) {
      markdown += '_No history entries found._\n'
      return markdown
    }

    // Group by date
    const entriesByDate = {}
    history.entries.forEach((entry) => {
      const date = entry.timestamp.split('T')[0]
      if (!entriesByDate[date]) {
        entriesByDate[date] = []
      }
      entriesByDate[date].push(entry)
    })

    // Generate markdown for each date
    Object.keys(entriesByDate)
      .sort()
      .reverse()
      .forEach((date) => {
        markdown += `## ${date}\n\n`

        entriesByDate[date].forEach((entry) => {
          const statusIcon =
            {
              success: '✅',
              partial: '⚠️',
              failed: '❌',
              blocked: '🚫',
            }[entry.outcome.status] || '📋'

          markdown += `### ${statusIcon} ${entry.task.description}\n\n`
          markdown += `**Context**: ${entry.context.package}`
          if (entry.context.area) {
            markdown += ` (${entry.context.area})`
          }
          markdown += `\n`
          markdown += `**Type**: ${entry.task.type}\n`

          if (entry.task.tags && entry.task.tags.length > 0) {
            markdown += `**Tags**: ${entry.task.tags.join(', ')}\n`
          }

          if (entry.files.modified?.length > 0 || entry.files.created?.length > 0) {
            markdown += `**Files**: `
            const allFiles = [
              ...(entry.files.created || []).map((f) => `${f} (created)`),
              ...(entry.files.modified || []).map((f) => `${f} (modified)`),
            ]
            markdown += allFiles.join(', ') + '\n'
          }

          markdown += `**Outcome**: ${entry.outcome.details || entry.outcome.status}\n`

          if (entry.metrics) {
            markdown += `**Metrics**: `
            const metrics = []
            if (entry.metrics.duration_minutes) {
              metrics.push(`${entry.metrics.duration_minutes}min`)
            }
            if (entry.metrics.tests_affected) {
              metrics.push(`${entry.metrics.tests_affected} tests`)
            }
            if (entry.metrics.coverage_impact) {
              metrics.push(`coverage ${entry.metrics.coverage_impact}`)
            }
            markdown += metrics.join(', ') + '\n'
          }

          markdown += '\n---\n\n'
        })
      })

    return markdown
  }

  /**
   * Generate usage statistics
   * @param {string} agentName - Name of the agent
   * @returns {Object} Usage statistics
   */
  getStats(agentName) {
    const history = this.readHistory(agentName)
    const entries = history.entries || []

    const stats = {
      total_tasks: entries.length,
      by_status: {},
      by_type: {},
      by_package: {},
      total_files_affected: 0,
      total_tests_affected: 0,
      average_duration: 0,
    }

    let totalDuration = 0
    let durationsCount = 0

    entries.forEach((entry) => {
      // Count by status
      const status = entry.outcome.status
      stats.by_status[status] = (stats.by_status[status] || 0) + 1

      // Count by type
      const type = entry.task.type
      stats.by_type[type] = (stats.by_type[type] || 0) + 1

      // Count by package
      const pkg = entry.context.package
      stats.by_package[pkg] = (stats.by_package[pkg] || 0) + 1

      // Sum metrics
      if (entry.metrics) {
        if (entry.metrics.files_count) {
          stats.total_files_affected += entry.metrics.files_count
        }
        if (entry.metrics.tests_affected) {
          stats.total_tests_affected += entry.metrics.tests_affected
        }
        if (entry.metrics.duration_minutes) {
          totalDuration += entry.metrics.duration_minutes
          durationsCount++
        }
      }
    })

    if (durationsCount > 0) {
      stats.average_duration = Math.round(totalDuration / durationsCount)
    }

    return stats
  }
}

// CLI usage
if (require.main === module) {
  const utils = new AgentHistoryUtils()
  const [, , command, agentName, ...args] = process.argv

  switch (command) {
    case 'query':
      const filters = {}
      for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace('--', '')
        const value = args[i + 1]
        filters[key] = value
      }
      const results = utils.queryHistory(agentName, filters)
      console.log(JSON.stringify(results, null, 2))
      break

    case 'markdown':
      const markdown = utils.generateMarkdownSummary(agentName)
      console.log(markdown)
      break

    case 'stats':
      const stats = utils.getStats(agentName)
      console.log(JSON.stringify(stats, null, 2))
      break

    default:
      console.log(`
Usage: node utils.js <command> <agent-name> [options]

Commands:
  query     Query history entries with filters
  markdown  Generate markdown summary from JSON
  stats     Show usage statistics

Examples:
  node utils.js query test-writer-fixer --package apps/mobile --status success
  node utils.js markdown test-writer-fixer > summary.md
  node utils.js stats test-writer-fixer
      `)
  }
}

module.exports = AgentHistoryUtils
