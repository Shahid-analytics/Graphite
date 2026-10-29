import { HelpTip } from '@/components/data/display'

const FIELDS = [
  ['Minute', '0-59'],
  ['Hour', '0-23'],
  ['Day of month', '1-31'],
  ['Month', '1-12'],
  ['Day of week', '0-6 (Sun = 0)'],
]

const EXAMPLES = [
  ['*/15 * * * *', 'Every 15 minutes'],
  ['0 */4 * * *', 'Every 4 hours, on the hour'],
  ['30 6 * * 1-5', '06:30 on weekdays'],
  ['0 2 1 * *', '02:00 on the 1st of each month'],
]

/** Cron syntax reference shown next to the custom cron input. */
export function CronCheatSheet() {
  return (
    <HelpTip label="Cron syntax help">
      <span className="block space-y-2">
        <span className="block">Five fields separated by spaces, evaluated in the selected timezone:</span>
        <span className="grid grid-cols-[auto_1fr] gap-x-3 font-mono text-[11px]">
          {FIELDS.map(([name, range]) => (
            <span key={name} className="contents">
              <span>{name}</span>
              <span>{range}</span>
            </span>
          ))}
        </span>
        <span className="block">
          <span className="font-mono">*</span> any value, <span className="font-mono">*/n</span> every n, <span className="font-mono">a-b</span> range,{' '}
          <span className="font-mono">a,b</span> list.
        </span>
        <span className="grid grid-cols-[auto_1fr] gap-x-3 text-[11px]">
          {EXAMPLES.map(([expr, meaning]) => (
            <span key={expr} className="contents">
              <span className="font-mono">{expr}</span>
              <span>{meaning}</span>
            </span>
          ))}
        </span>
      </span>
    </HelpTip>
  )
}
