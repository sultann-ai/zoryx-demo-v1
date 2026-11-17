import { Fragment } from 'react'

/**
 * Fill {placeholders} in a translated sentence. Each value goes in an isolated left-to-right run, so amounts
 * like "Rs 1,050" never get scrambled inside right-to-left Urdu text.
 */
export function Fill({ text, values }: { text: string; values: Record<string, string> }) {
  return (
    <>
      {text.split(/(\{\w+\})/).map((part, index) => {
        const key = /^\{(\w+)\}$/.exec(part)?.[1]
        return key && key in values ? (
          <bdi key={index} dir="ltr">
            {values[key]}
          </bdi>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      })}
    </>
  )
}
