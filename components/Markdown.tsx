import React, { useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github-dark.css';
import { ChatImage } from './ChatImage';
import { copyText, downloadImage } from '../services/fileService';

/** react-markdown elimina las URLs `data:` por seguridad; permitimos sólo imágenes. */
const markdownUrlTransform = (url: string) =>
    /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url) ? url : defaultUrlTransform(url);

/** Texto plano de los hijos (el resaltado los convierte en spans). */
const textOf = (node: any): string =>
    typeof node === 'string' ? node
        : Array.isArray(node) ? node.map(textOf).join('')
            : node?.props?.children !== undefined ? textOf(node.props.children) : '';

/** Bloque de código con el lenguaje y un botón para copiarlo. */
const CodeBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [copied, setCopied] = useState(false);
    const code = React.Children.toArray(children)[0] as any;
    const lang = /language-([\w-]+)/.exec(code?.props?.className || '')?.[1];
    const copy = async () => {
        if (await copyText(textOf(code?.props?.children).replace(/\n$/, ''))) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        }
    };
    return (
        <div className="my-2 rounded-lg overflow-hidden border border-black/20 bg-[#0d1117]">
            <div className="flex items-center justify-between px-3 py-1 text-[11px] text-gray-400 bg-white/5">
                <span className="font-mono">{lang || 'código'}</span>
                <button onClick={copy} className="flex items-center gap-1 hover:text-white" aria-label="Copiar código">
                    {copied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                </button>
            </div>
            <pre className="p-3 overflow-x-auto text-sm leading-relaxed m-0">{children}</pre>
        </div>
    );
};

/** Markdown de las respuestas del modelo: GFM, fórmulas ($…$, $$…$$) y código resaltado. */
export const Markdown: React.FC<{ children: string }> = ({ children }) => (
    <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: 'ignore' }], [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        urlTransform={markdownUrlTransform}
        components={{
            p: ({ node, ...props }) => <p className="mb-2 last:mb-0" {...props} />,
            a: ({ node, ...props }) => {
                // Los enlaces que apuntan a una imagen se muestran como imagen
                const isImage = /\.(jpeg|jpg|gif|png|webp|bmp|svg)($|\?)/i.test(props.href || '');
                if (isImage) {
                    return <ChatImage src={props.href} alt="Imagen enlazada" onDownload={downloadImage} />;
                }
                return <a className="text-blue-500 hover:underline font-medium break-all" target="_blank" rel="noopener noreferrer" {...props} />;
            },
            ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
            li: ({ node, ...props }) => <li className="pl-1" {...props} />,
            h1: ({ node, ...props }) => <h1 className="text-xl font-bold mt-4 mb-2" {...props} />,
            h2: ({ node, ...props }) => <h2 className="text-lg font-bold mt-3 mb-2" {...props} />,
            h3: ({ node, ...props }) => <h3 className="text-base font-bold mt-2 mb-1" {...props} />,
            code: ({ node, className, children, ...props }) => {
                // Dentro de un bloque (<pre>) el estilo lo pone CodeBlock y el resaltado
                const isBlock = /language-|hljs/.test(className || '') || String(children).includes('\n');
                return isBlock
                    ? <code className={`${className || ''} font-mono text-gray-100`} {...props}>{children}</code>
                    : <code className="bg-surface-highlight dark:bg-black/30 px-1 py-0.5 rounded font-mono text-sm" {...props}>{children}</code>;
            },
            pre: ({ node, children }) => <CodeBlock>{children}</CodeBlock>,
            table: ({ node, ...props }) => <div className="overflow-x-auto my-3 border border-border rounded-lg"><table className="w-full text-sm border-collapse" {...props} /></div>,
            thead: ({ node, ...props }) => <thead className="bg-surface-highlight text-text-muted font-semibold" {...props} />,
            th: ({ node, ...props }) => <th className="p-2 border-b border-r border-border last:border-r-0 text-left" {...props} />,
            td: ({ node, ...props }) => <td className="p-2 border-b border-r border-border last:border-r-0" {...props} />,
            blockquote: ({ node, ...props }) => <blockquote className="border-l-4 border-primary/50 pl-4 italic my-2 text-text-muted" {...props} />,
            img: ({ node, ...props }) => <ChatImage src={props.src} alt={props.alt} onDownload={downloadImage} />
        }}
    >
        {children}
    </ReactMarkdown>
);
