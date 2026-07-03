interface SectionHeadingProps {
  eyebrow: string
  title: string
  description?: string
  align?: 'left' | 'center'
}

export function SectionHeading({ eyebrow, title, description, align = 'left' }: SectionHeadingProps) {
  const centered = align === 'center'
  return (
    <div data-reveal className={`max-w-2xl ${centered ? 'mx-auto text-center' : ''}`}>
      <p className="eyebrow mb-4">{eyebrow}</p>
      <h2 className="font-display text-3xl leading-tight font-semibold tracking-tight text-foam sm:text-4xl lg:text-[2.75rem]">{title}</h2>
      {description && <p className="mt-5 text-lg text-mist">{description}</p>}
    </div>
  )
}
