# Petlibro Glossary (Active) 规则与结构说明 (Petlibro Glossary(Active) Rule)

本文档说明了 [Petlibro Glossary (Active)](https://docs.google.com/spreadsheets/d/1prNDj4NLWcHUMBz7EhALB22Sk-B-ThXy85kPx4nQVOE/edit?usp=sharing) 电子表格的数据结构与字段规则。该电子表格是一个动态更新的翻译语料库，用于记录 Petlibro 专有名词（如营销文案、UI 提示等）的官方翻译及其审核状态。

## 1. 标题行结构 (Header Structure)

电子表格的第一行定义了每列所代表的信息标题：

- **第 A 列 (Column A):** `Source: English (EN)` (原始英文翻译) - 代表需要被翻译的英文原文词汇或短语。
- **第 B 列 (Column B):** `Target: German (DE)` (目标语言：德文) - 代表原文被翻译为目标语言（以德文为例）后的内容。*注：如果该表扩展到其他语言，可能会有 Target: French (FR), Target: Spanish (ES) 等列。*
- **第 C 列 (Column C):** `Confidence` (翻译置信度) - 评估该翻译的自然程度和准确性。
- **第 D 列 (Column D):** `Approved` (审核人/审核状态) - 记录确认该翻译的审核人员（如 Donesh、Native reviewer 等）。
- **第 E 列 (Column E):** `Date` (日期) - 该翻译被添加或最后审核的日期。
- **第 F 列 (Column F):** `Notes` (备注) - 关于该词汇用法的额外说明或上下文解释（例如：Standard pet-parent vernacular）。

---

## 2. Confidence (置信度) 标志指南

根据翻译的质量和自然程度，`Confidence` 列分为三个等级。在使用本语料库进行翻译时，请严格参考以下指南处理不同置信度的翻译：


| 标志 (Flag)  | 含义 (Meaning)                                         | 操作建议 (What You Should Do)                       |
| ---------- | ---------------------------------------------------- | ----------------------------------------------- |
| **HIGH**   | **自然对等。** 听起来就像真实的宠物主人的日常用语。对语域和文化契合度没有任何疑问。         | **添加到词汇表并直接使用。** 在该市场的所有未来内容中统一使用此术语。           |
| **MEDIUM** | **有效的翻译，但不够完美。** 存在文化差异、地域差异或语域问题。虽然说得通，但并非 100% 自然。 | **在发布前必须交由当地母语人士确认。** 未经审核，请勿直接发布。              |
| **LOW**    | **无法清晰转换概念。** 丢失了文化背景，或者习语没有对应的表达。译者不得不在保真度和语域之间做取舍。 | **与创意总监或市场负责人讨论。** 可能需要重写源内容。未经利益相关者批准，请勿发布此版本。 |


### 置信度示例说明：

以源文本 (Source) `"Your pet just finished eating"` 为例：

- **德文:** `"Deine Katze hat gerade fertig gegessen"` = **HIGH** (表达自然贴切)
- **日文:** `"ペットが食べ終わりました"` = **MEDIUM** (语法正确，但稍显正式；日本的宠物主人可能会有不同的说法)
- **意大利文:** `"Il tuo animale domestico ha appena finito di mangiare"` = **LOW** (过于正式；意大利人更倾向于说 "Il tuo cane/gatto ha finito di mangiare" —— 需要明确指出是哪种宠物)

