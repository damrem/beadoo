import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const COMPONENTS: Components = {
  h1: ({ node: _node, ...props }) => <h4 className="mt-3 mb-1 text-base font-semibold first:mt-0" {...props} />,
  h2: ({ node: _node, ...props }) => <h4 className="mt-3 mb-1 text-sm font-semibold first:mt-0" {...props} />,
  h3: ({ node: _node, ...props }) => <h5 className="mt-2 mb-1 text-sm font-semibold first:mt-0" {...props} />,
  h4: ({ node: _node, ...props }) => <h6 className="mt-2 mb-1 text-sm font-medium first:mt-0" {...props} />,
  h5: ({ node: _node, ...props }) => <h6 className="mt-2 mb-1 text-sm font-medium first:mt-0" {...props} />,
  h6: ({ node: _node, ...props }) => <h6 className="mt-2 mb-1 text-sm font-medium first:mt-0" {...props} />,
  p: ({ node: _node, ...props }) => <p className="my-1.5 first:mt-0 last:mb-0" {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="my-1.5 list-disc pl-5" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="my-1.5 list-decimal pl-5" {...props} />,
  li: ({ node: _node, ...props }) => <li className="my-0.5" {...props} />,
  a: ({ node: _node, ...props }) => (
    <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...props} />
  ),
  blockquote: ({ node: _node, ...props }) => (
    <blockquote className="my-1.5 border-l-2 border-border pl-3 text-muted-foreground" {...props} />
  ),
  hr: ({ node: _node, ...props }) => <hr className="my-3 border-border" {...props} />,
  pre: ({ node: _node, ...props }) => (
    <pre
      className="my-1.5 overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  code: ({ node: _node, ...props }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.8em]" {...props} />,
  table: ({ node: _node, ...props }) => (
    <div className="my-1.5 overflow-x-auto">
      <table className="w-full border-collapse text-xs" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => <th className="border border-border bg-muted px-2 py-1 text-left font-medium" {...props} />,
  td: ({ node: _node, ...props }) => <td className="border border-border px-2 py-1" {...props} />,
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="text-sm break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
