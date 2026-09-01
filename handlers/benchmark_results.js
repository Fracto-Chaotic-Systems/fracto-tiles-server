import {readdir, readFile, stat} from 'node:fs/promises'
import path from 'node:path'

const BENCHMARK_STRATEGIES = ['legacy', 'turbo']
const BENCHMARK_ROOT = path.resolve(import.meta.dirname, '..', 'benchmarks')

const latest_report = async strategy => {
   const directory = path.join(BENCHMARK_ROOT, strategy)
   let entries
   try {
      entries = await readdir(directory, {withFileTypes: true})
   } catch (error) {
      if (error.code === 'ENOENT') return null
      throw error
   }
   const reports = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
      .sort((left, right) => right.name.localeCompare(left.name))
   if (!reports.length) return null
   const report_path = path.join(directory, reports[0].name)
   const [content, metadata] = await Promise.all([
      readFile(report_path, 'utf8'),
      stat(report_path),
   ])
   return {
      filename: reports[0].name,
      updated_at: metadata.mtime.toISOString(),
      report: JSON.parse(content),
   }
}

/** Returns the newest stored report for each renderer strategy.
 * @param {import('express').Request} req Express request (no query parameters).
 * @param {import('express').Response} res Response containing `legacy` and `turbo` reports.
 * @returns {Promise<void>} Resolves after both report directories are read.
 * @calledBy TilesTest UI page through TilesBackend.benchmark_results.
 * @note Missing report directories are returned as null; malformed reports return HTTP 500.
 */
export const handle_benchmark_results = async (req, res) => {
   try {
      const results = {}
      for (const strategy of BENCHMARK_STRATEGIES) {
         results[strategy] = await latest_report(strategy)
      }
      res.json(results)
   } catch (error) {
      console.error('benchmark results read error', error)
      res.status(500).json({error: error.message})
   }
}
