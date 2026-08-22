import logo from '../assets/pacewisdom.png'

/**
 * The Pacewisdom wordmark.
 *
 * The source art is solid black on transparent and the app defaults to the dark
 * theme, so the mark is inverted under [data-theme='dark'] — an exact white
 * version, rather than shipping and maintaining a second asset.
 */
export function Brand({
  className = 'h-6',
  withTagline = false,
}: {
  className?: string
  withTagline?: boolean
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <img
        src={logo}
        alt="Pacewisdom"
        className={`${className} w-auto [[data-theme=dark]_&]:invert`}
      />
      {withTagline && (
        <span className="text-[0.7rem] tracking-wide text-text-muted">
          Powered by DevOps Team
        </span>
      )}
    </div>
  )
}
