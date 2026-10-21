import React from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChatImage } from './ChatImage';
import { downloadImage } from '../services/fileService';

/** react-markdown elimina las URLs `data:` por seguridad; permitimos sólo imágenes. */
const markdownUrlTransform = (url: string) =>
    /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url) ? url : defaultUrlTransform(url);

/** Markdown de las respuestas del modelo (GFM: tablas, listas de tareas, tachado). */
export const Markdown: React.FC<{ children: string }> = ({ children }) => (
    <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
            code: ({ node, ...props }) => {
                const match = /language-(\w+)/.exec(props.className || '');
                const isInline = !match && !String(props.children).includes('\n');
                return isInline
                    ? <code className="bg-surface-highlight dark:bg-black/30 px-1 py-0.5 rounded font-mono text-sm" {...props} />
                    : <code className="block bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto font-mono text-sm my-2" {...props} />;
            },
            pre: ({ node, ...props }) => <pre className="bg-transparent p-0 m-0" {...props} />,
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
