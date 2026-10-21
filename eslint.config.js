import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
    { ignores: ['dist', 'node_modules', 'tests/fixtures'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            globals: { ...globals.browser, ...globals.node }
        },
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            // El código trabaja con JSON de muchas APIs distintas: `any` es deliberado
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
            'no-empty': ['error', { allowEmptyCatch: true }]
        }
    }
);
