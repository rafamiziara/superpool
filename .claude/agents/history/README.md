# Agent Execution History

This directory maintains a structured history of agent task executions across the SuperPool project using JSON format for enhanced auditing and analysis capabilities.

## Structure

Each agent maintains its own JSON history file:

- `test-writer-fixer.json` - Test creation, fixing, and maintenance tasks
- `rapid-prototyper.json` - Rapid prototyping and MVP development tasks
- `ui-designer.json` - UI design and interface tasks
- `backend-architect.json` - Backend architecture and API tasks
- `mobile-app-builder.json` - Mobile app development tasks
- `devops-automator.json` - DevOps and deployment tasks
- `performance-benchmarker.json` - Performance testing and optimization tasks
- `sprint-prioritizer.json` - Sprint planning and prioritization tasks
- `whimsy-injector.json` - UI/UX delight and whimsical enhancement tasks
- (other agents as they are used)

## JSON Schema

All history files follow the standardized schema defined in `schema.json`. Each entry includes:

### Required Fields

- **timestamp**: ISO 8601 datetime when task was executed
- **context**: Object with `package` (required) and optional `area`
- **task**: Object with `type`, `description`, and optional `tags` array
- **files**: Object with arrays for `modified`, `created`, and `analyzed` files
- **outcome**: Object with `status` and optional `details`, `follow_up_needed`, `issues_found`

### Optional Fields

- **metrics**: Object with `duration_minutes`, `tests_affected`, `coverage_impact`, `files_count`

## Usage Tools

### Command Line Utility (`utils.js`)

Query and analyze agent history:

```bash
# Query specific tasks
node utils.js query test-writer-fixer --package apps/mobile --status success

# Generate human-readable markdown summary
node utils.js markdown test-writer-fixer > summary.md

# Get usage statistics
node utils.js stats test-writer-fixer
```

### Programmatic Access

```javascript
const AgentHistoryUtils = require('./utils.js')
const utils = new AgentHistoryUtils()

// Get all entries for an agent
const history = utils.readHistory('test-writer-fixer')

// Query with filters
const mobileTests = utils.queryHistory('test-writer-fixer', {
  package: 'apps/mobile',
  taskType: 'fix',
  since: '2025-01-01',
})

// Generate statistics
const stats = utils.getStats('test-writer-fixer')
```

## Auditing Capabilities

The JSON format enables:

### Query Examples

```bash
# Find all failed tasks across agents
jq '.entries[] | select(.outcome.status == "failed")' *.json

# Tasks by specific package in last 7 days
jq '.entries[] | select(.context.package == "apps/mobile" and (.timestamp | fromdateiso8601) > (now - 7*24*3600))' *.json

# Coverage impact analysis
jq '.entries[] | select(.metrics.coverage_impact) | {task: .task.description, impact: .metrics.coverage_impact}' *.json

# Most time-consuming tasks
jq '.entries[] | select(.metrics.duration_minutes) | {task: .task.description, duration: .metrics.duration_minutes}' *.json | jq -s 'sort_by(.duration) | reverse'
```

### Metrics & Reporting

- Track agent usage patterns by package, task type, and outcome
- Measure agent effectiveness and impact on project
- Identify areas requiring most maintenance or fixes
- Generate time-based usage reports
- Monitor test coverage trends

## Purpose

This structured history system provides:

- **Comprehensive audit trail** for all agent activities
- **Programmatic analysis** of agent usage patterns and effectiveness
- **Data-driven insights** for improving agent configurations
- **Accountability** for changes made by automated agents
- **Trend analysis** for project health and development velocity
- **Easy integration** with monitoring and reporting tools

## Migration from Markdown

Previous markdown-based histories have been converted to JSON format, preserving all historical data while enabling enhanced querying and analysis capabilities.
