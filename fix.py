import re

path = 'E:/Vaultly/src-tauri/src/lib.rs'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('for entry in entries {', 'for entry in entries.flatten() {')
content = content.replace('if let Ok(entry) = entry {', '')
# adjust bracket manually for the flatten part
# Ah wait, the bracket balance will be off. Regex is better.
content = re.sub(r'for entry in entries \{\s+if let Ok\(entry\) = entry \{\s+(.*?)\s+\}\s+\}', r'for entry in entries.flatten() {\n        \1\n    }', content, flags=re.DOTALL)

content = content.replace('.split(\':\').last()', '.split(\':\').next_back()')
content = content.replace('for (_, network) in net_guard.iter()', 'for network in net_guard.values()')
content = content.replace('.sort_by(|a, b| b.size.cmp(&a.size))', '.sort_by_key(|b| std::cmp::Reverse(b.size))')
content = content.replace('.args(&[', '.args([')

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
