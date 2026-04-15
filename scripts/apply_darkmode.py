#!/usr/bin/env python3
"""Apply Design A dark mode + green primary substitutions to restored phase-2 screens.

Uses regex with negative lookbehind (?<!dark:) so substitutions are never applied
to classes that are already part of a dark: variant inserted by an earlier rule.
"""
import re
import sys
from pathlib import Path

# Each entry: (pattern_to_match, replacement)
# Pattern is matched as a standalone Tailwind class — surrounded by word boundaries
# and NOT preceded by "dark:" (negative lookbehind).
# Order matters only for the "extra" targeted replacements; the main SUBSTITUTIONS
# list is applied in a single regex pass to avoid cascade issues.

SUBSTITUTIONS: list[tuple[str, str]] = [
    # ── Sky → Green (primary color swap) ────────────────────────────────────────
    ('bg-sky-600',           'bg-green-600'),
    ('bg-sky-700',           'bg-green-700'),
    ('bg-sky-500',           'bg-green-500'),
    ('bg-sky-400',           'bg-green-400'),
    ('bg-sky-50',            'bg-green-50 dark:bg-green-900/20'),
    ('bg-sky-100',           'bg-green-100 dark:bg-green-900/30'),
    ('text-sky-800',         'text-green-800 dark:text-green-300'),
    ('text-sky-700',         'text-green-700 dark:text-green-400'),
    ('text-sky-600',         'text-green-600 dark:text-green-400'),
    ('text-sky-500',         'text-green-500 dark:text-green-400'),
    ('text-sky-400',         'text-green-400'),
    ('text-sky-300',         'text-green-300'),
    ('hover:bg-sky-700',     'hover:bg-green-700'),
    ('hover:bg-sky-100',     'hover:bg-green-100 dark:hover:bg-green-900/30'),
    ('hover:bg-sky-50',      'hover:bg-green-50 dark:hover:bg-green-900/20'),
    ('hover:text-sky-700',   'hover:text-green-700 dark:hover:text-green-300'),
    ('hover:text-sky-600',   'hover:text-green-600 dark:hover:text-green-400'),
    ('hover:text-sky-300',   'hover:text-green-300'),
    ('border-sky-300',       'border-green-300 dark:border-green-700'),
    ('border-sky-200',       'border-green-200 dark:border-green-800'),
    ('border-sky-100',       'border-green-100 dark:border-green-800'),
    ('focus:ring-sky-300',   'focus:ring-green-300'),
    ('focus:border-sky-300', 'focus:border-green-300'),
    ('ring-sky-200',         'ring-green-200 dark:ring-green-800'),
    ('disabled:bg-sky-400',  'disabled:bg-green-400'),
    ('hover:border-sky-300', 'hover:border-green-300 dark:hover:border-green-700'),
    # ── Slate backgrounds ────────────────────────────────────────────────────────
    ('bg-white',             'bg-white dark:bg-slate-800'),
    ('bg-slate-50',          'bg-slate-50 dark:bg-slate-800/50'),
    ('bg-slate-100',         'bg-slate-100 dark:bg-slate-700'),
    ('hover:bg-slate-50',    'hover:bg-slate-50 dark:hover:bg-slate-700/50'),
    ('hover:bg-slate-100',   'hover:bg-slate-100 dark:hover:bg-slate-700'),
    ('hover:bg-slate-200',   'hover:bg-slate-200 dark:hover:bg-slate-600'),
    # ── Slate text ───────────────────────────────────────────────────────────────
    ('text-slate-900',       'text-slate-900 dark:text-slate-100'),
    ('text-slate-800',       'text-slate-800 dark:text-slate-200'),
    ('text-slate-700',       'text-slate-700 dark:text-slate-300'),
    ('text-slate-600',       'text-slate-600 dark:text-slate-400'),
    ('text-slate-500',       'text-slate-500 dark:text-slate-400'),
    ('text-slate-400',       'text-slate-400 dark:text-slate-500'),
    ('text-slate-300',       'text-slate-300 dark:text-slate-600'),
    ('hover:text-slate-900', 'hover:text-slate-900 dark:hover:text-slate-100'),
    ('hover:text-slate-800', 'hover:text-slate-800 dark:hover:text-slate-200'),
    ('hover:text-slate-700', 'hover:text-slate-700 dark:hover:text-slate-300'),
    ('hover:text-slate-600', 'hover:text-slate-600 dark:hover:text-slate-400'),
    # ── Borders ──────────────────────────────────────────────────────────────────
    ('divide-slate-200',     'divide-slate-200 dark:divide-slate-700'),
    ('divide-slate-100',     'divide-slate-100 dark:divide-slate-700'),
    ('border-slate-200',     'border-slate-200 dark:border-slate-700'),
    ('border-slate-100',     'border-slate-100 dark:border-slate-700/50'),
]

# File-specific targeted replacements (applied AFTER the main pass)
EXTRA: dict[str, list[tuple[str, str]]] = {
    'src/screens/MaintenanceScreen.tsx': [
        # inp constant
        (
            "const inp = 'w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-300 bg-white'",
            "const inp = 'w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-green-300 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500'",
        ),
        # priorityConfig (after main pass already added dark: to bg/text, but just in case)
        (
            "low:      { label: 'Low',      bg: 'bg-slate-100 dark:bg-slate-700',  text: 'text-slate-600 dark:text-slate-400',  dot: 'bg-slate-300'  },",
            "low:      { label: 'Low',      bg: 'bg-slate-100 dark:bg-slate-700',  text: 'text-slate-600 dark:text-slate-400',  dot: 'bg-slate-300 dark:bg-slate-500'  },",
        ),
    ],
    'src/screens/DashboardScreen.tsx': [
        (
            "critical: 'text-red-600 bg-red-50 border-red-200',",
            "critical: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800',",
        ),
        (
            "high:     'text-orange-600 bg-orange-50 border-orange-200',",
            "high:     'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800',",
        ),
        (
            "medium:   'text-amber-600 bg-amber-50 border-amber-200',",
            "medium:   'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800',",
        ),
        (
            "low:      'text-slate-500 bg-slate-50 border-slate-200',",
            "low:      'text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600',",
        ),
    ],
    'src/screens/BudgetScreen.tsx': [
        (
            "critical: { label: 'Critical', bar: 'bg-red-500',    badge: 'text-red-700 bg-red-50 border-red-200'       },",
            "critical: { label: 'Critical', bar: 'bg-red-500',    badge: 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800'       },",
        ),
        (
            "high:     { label: 'High',     bar: 'bg-orange-500', badge: 'text-orange-700 bg-orange-50 border-orange-200' },",
            "high:     { label: 'High',     bar: 'bg-orange-500', badge: 'text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800' },",
        ),
        (
            "medium:   { label: 'Medium',   bar: 'bg-amber-400',  badge: 'text-amber-700 bg-amber-50 border-amber-200'  },",
            "medium:   { label: 'Medium',   bar: 'bg-amber-400',  badge: 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'  },",
        ),
        (
            "low:      { label: 'Low',      bar: 'bg-slate-300',  badge: 'text-slate-600 bg-slate-50 border-slate-200'  },",
            "low:      { label: 'Low',      bar: 'bg-slate-300 dark:bg-slate-500',  badge: 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600'  },",
        ),
    ],
}

FILES = [
    'src/screens/MaintenanceScreen.tsx',
    'src/screens/DashboardScreen.tsx',
    'src/screens/BudgetScreen.tsx',
    'src/screens/SettingsScreen.tsx',
    'src/screens/EquipmentFormScreen.tsx',
    'src/components/layout/AppShell.tsx',
]


def build_single_pass_regex(subs: list[tuple[str, str]]) -> re.Pattern:
    """Build one combined pattern so all substitutions happen in a single pass."""
    # Sort by descending length so longer/more-specific patterns match first
    sorted_subs = sorted(subs, key=lambda t: len(t[0]), reverse=True)
    parts = [re.escape(old) for old, _ in sorted_subs]
    return re.compile(
        # Negative lookbehind: don't match if immediately preceded by 'dark:'
        r'(?<!dark:)' + '(' + '|'.join(parts) + ')',
    ), sorted_subs


def apply_single_pass(text: str, pattern: re.Pattern, sorted_subs: list[tuple[str, str]]) -> str:
    lookup = {old: new for old, new in sorted_subs}
    def replacer(m: re.Match) -> str:
        return lookup.get(m.group(0), m.group(0))
    return pattern.sub(replacer, text)


def apply_extras(text: str, extras: list[tuple[str, str]]) -> str:
    for old, new in extras:
        if old in text and new not in text:
            text = text.replace(old, new)
    return text


def process_file(repo_root: Path, rel_path: str, pattern: re.Pattern, sorted_subs: list) -> None:
    path = repo_root / rel_path
    original = path.read_text(encoding='utf-8')
    text = apply_single_pass(original, pattern, sorted_subs)
    if rel_path in EXTRA:
        text = apply_extras(text, EXTRA[rel_path])
    if text != original:
        path.write_text(text, encoding='utf-8')
        added = text.count('dark:') - original.count('dark:')
        print(f"  {rel_path}: +{added} dark: tokens")
    else:
        print(f"  {rel_path}: no changes")


if __name__ == '__main__':
    repo_root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('.')
    print(f"Processing: {repo_root}")
    pattern, sorted_subs = build_single_pass_regex(SUBSTITUTIONS)
    for f in FILES:
        process_file(repo_root, f, pattern, sorted_subs)
    print("Done.")
