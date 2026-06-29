# 研究员库 — 录入操作指南

> 本文件供 WorkBuddy 读取。WorkBuddy 读完此文件后，即可帮用户往研究员库录入新内容。

## 这是什么

用户维护一个"研究员库"，记录各投资研究员对股票/标的的研究观点。
数据托管在 GitHub，网页前端在 https://zerodk2026.github.io/researcher-library/

## 数据结构

数据存储在 GitHub 仓库 `zerodk2026/researcher-library-data`（私有）的 `data/index.json`，结构：

```json
{
  "meta": {
    "knowledge_base_name": "研究员库",
    "total_researchers": 32,
    "total_records": 109
  },
  "researchers": [
    {
      "name": "研究员姓名",
      "subjects": {
        "标的名称": [
          {
            "title": "记录标题",
            "date": "2026-06-29",
            "direction": "看多/看空/中性/中性偏多/看多但谨慎",
            "subject": "标的名称",
            "is_main": true,
            "content": "Markdown 格式的研究记录全文",
            "summary": "一句话概要"
          }
        ]
      },
      "item_count": 5,
      "rating": 4.5,
      "style": "研究员风格描述"
    }
  ],
  "subject_index": [
    {"subject": "标的名称", "count": 3}
  ]
}
```

## 如何录入新记录

用户会粘贴一段研究员的分析内容（可能包含公告原文、数据推演、观点总结等）。

你需要：
1. 从内容中提取：**研究员姓名、标的名称、日期、方向（看多/看空/中性等）、核心观点**
2. 将内容整理为结构化的 Markdown
3. 运行下方脚本写入 GitHub

### 方向分类标准
- `看多`：明确看涨
- `看空`：明确看跌
- `中性`：不偏不倚
- `中性偏多`：偏乐观但不强烈
- `看多但谨慎`：看多但有风险提示
- 其他自定义方向也可以

### 运行录入脚本

```bash
# 确保 Python 3 可用，然后运行：
python -c "
import json, base64, urllib.request

# GitHub 配置
TOKEN = '<用户提供的token>'
OWNER = 'zerodk2026'
REPO = 'researcher-library-data'
PATH = 'data/index.json'
BRANCH = 'main'
API = f'https://api.github.com/repos/{OWNER}/{REPO}/contents/{PATH}'

# 1. 拉取当前数据
req = urllib.request.Request(f'{API}?ref={BRANCH}', headers={'Authorization': f'Bearer {TOKEN}'})
resp = urllib.request.urlopen(req)
info = json.loads(resp.read())
sha = info['sha']
content = base64.b64decode(info['content']).decode('utf-8')
data = json.loads(content)

# 2. 添加新记录
researcher_name = '研究员姓名'
subject = '标的名称'
record = {
    'title': f'{subject}_2026-06-30 — 核心观点摘要',
    'date': '2026-06-30',
    'direction': '看多',
    'subject': subject,
    'is_main': True,
    'content': '完整的 Markdown 内容',
    'summary': '一句话概要'
}

# 找到或创建研究员
r = next((x for x in data['researchers'] if x['name'] == researcher_name), None)
if not r:
    r = {'name': researcher_name, 'subjects': {}, 'item_count': 0, 'rating': 0, 'style': ''}
    data['researchers'].append(r)
if subject not in r['subjects']:
    r['subjects'][subject] = []
r['subjects'][subject].append(record)
r['item_count'] = sum(len(v) for v in r['subjects'].values())

# 更新 meta
data['meta']['total_records'] = sum(r['item_count'] for r in data['researchers'])

# 更新 subject_index
all_subs = {}
for r in data['researchers']:
    for sk, recs in r['subjects'].items():
        all_subs[sk] = all_subs.get(sk, 0) + len(recs)
data['subject_index'] = [{'subject': k, 'count': v} for k, v in sorted(all_subs.items(), key=lambda x: -x[1])]
data['meta']['total_subjects'] = len(all_subs)

# 3. 推送回 GitHub
new_content = json.dumps(data, ensure_ascii=False, indent=2).encode('utf-8')
b64 = base64.b64encode(new_content).decode()
payload = json.dumps({'message': f'Add record: {researcher_name}/{subject}', 'content': b64, 'sha': sha, 'branch': BRANCH}).encode()
req = urllib.request.Request(API, data=payload, method='PUT', headers={
    'Authorization': f'Bearer {TOKEN}',
    'Content-Type': 'application/json'
})
resp = urllib.request.urlopen(req)
print('✅ 已录入:', record['title'])
print('📊 当前总记录数:', data['meta']['total_records'])
"
```

## 注意事项

1. **不要创建本地文件**，直接通过 GitHub API 操作云端数据
2. **Token 来源**：问用户要，或者用户网页的"设置"按钮里可以看到
3. **录入后**：告诉用户去 https://zerodk2026.github.io/researcher-library/ 刷新查看
4. **内容格式**：保留研究员的原始分析逻辑，整理为清晰的 Markdown（标题、列表、表格、引用等）
5. **投资体系/宏观观点不属于跟踪标的**：如果研究员讲的是方法论或宏观，不要加到 subjects 里，可以加到一个特殊的 `_研究体系_` 分组下
