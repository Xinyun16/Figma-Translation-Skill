# Petlibro Glossary 规则与结构说明 (Petlibro Glossary Rule)

本文档说明 [Petlibro Glossary (Internal)](https://docs.google.com/spreadsheets/d/1FimNIsjXo3WxGm9p1b0a47oOfwJ7EgRHHURQEVd5wCQ/edit?gid=0#gid=0) 电子表格的数据结构与字段规则，以便于理解与使用各国语言的翻译对照信息。

## 1. 标题行结构 (Header Structure)

电子表格的最上方两行定义了数据的属性与多国语言的对应关系：

* **第一行 (语言类型 / Language):** 定义了各个区块对应的语言，包含 EN (英文)、DE (德文)、FR (法文)、ES (西班牙文)、IT (意大利文)、Dutch (荷兰文)、Polish (波兰文)、Swedish (瑞典文)、Traditional Chinese (繁体中文)、简体中文 Simplified Chinese 等。
* **第二行 (信息标题 / Column Header):** 定义了该字段内具体填写的信息内容，包含 Product Line (产品线)、Model (产品型号)、Product Name (产品名称)、Slogan (产品口号)、One-sentence description (一句话描述) 等。

---

## 2. 字段对应规则 (Column Mapping)

### 共通属性 (Global Attributes)
这两个字段为全局共用的产品基本信息：
* **第 A 列 (Column A):** `Product Line` (产品线类型，例如：Feeder 喂食器、Fountain 饮水器、Accessory 配件等)
* **第 B 列 (Column B):** `Model` (产品型号，例如：AF105、LB001、WF106 等)

### 多国语言翻译 (Localization Columns)
从第 C 列开始，**每 3 列为一组**，对应一种特定语言的产品翻译信息。每一组皆固定包含三个维度的翻译：`Product Name` (产品名称)、`Slogan` (产品口号) 与 `One-sentence description` (一句话描述)。

* **第 C 列至第 E 列 (EN - 英文):**
  * **C 列:** Product Name (英文产品名称)
  * **D 列:** Slogan (英文产品口号)
  * **E 列:** One-sentence description (英文一句话描述)

* **第 F 列至第 H 列 (DE - 德文):**
  * **F 列:** Product Name (德文产品名称)
  * **G 列:** Slogan (德文产品口号)
  * **H 列:** One-sentence description (德文一句话描述)

* **第 I 列至第 K 列 (FR - 法文):**
  * **I 列:** Product Name (法文产品名称)
  * **J 列:** Slogan (法文产品口号)
  * **K 列:** One-sentence description (法文一句话描述)

* **第 L 列至第 N 列 (ES - 西班牙文):**
  * **L 列:** Product Name (西班牙文产品名称)
  * **M 列:** Slogan (西班牙文产品口号)
  * **N 列:** One-sentence description (西班牙文一句话描述)

* **第 O 列至第 Q 列 (IT - 意大利文):**
  * **O 列:** Product Name (意大利文产品名称)
  * **P 列:** Slogan (意大利文产品口号)
  * **Q 列:** One-sentence description (意大利文一句话描述)

* **第 R 列至第 T 列 (Dutch - 荷兰文):**
  * **R 列:** Product Name (荷兰文产品名称)
  * **S 列:** Slogan (荷兰文产品口号)
  * **T 列:** One-sentence description (荷兰文一句话描述)

* **第 U 列至第 W 列 (Polish - 波兰文):**
  * **U 列:** Product Name (波兰文产品名称)
  * **V 列:** Slogan (波兰文产品口号)
  * **W 列:** One-sentence description (波兰文一句话描述)

* **第 X 列至第 Z 列 (Swedish - 瑞典文):**
  * **X 列:** Product Name (瑞典文产品名称)
  * **Y 列:** Slogan (瑞典文产品口号)
  * **Z 列:** One-sentence description (瑞典文一句话描述)

* **第 AA 列至第 AC 列 (Traditional Chinese - 繁体中文):**
  * **AA 列:** Product Name (繁体中文产品名称)
  * **AB 列:** Slogan (繁体中文产品口号)
  * **AC 列:** One-sentence description (繁体中文一句话描述)

* **第 AD 列至第 AF 列 (Simplified Chinese - 简体中文):**
  * **AD 列:** Product Name (简体中文产品名称)
  * **AE 列:** Slogan (简体中文产品口号)
  * **AF 列:** One-sentence description (简体中文一句话描述)

---

## 3. 数据读取逻辑示例
若开发者或系统需通过程序读取该电子表格，可依据上述字段规则进行解析。例如：
- 欲获取“AF105”型号的**法文**产品名称，应先比对 B 列找到对应的行数，再读取该行的 **I 列** 值。
- 欲获取“Luma Smart Litter Box”的**简体中文**口号，可定位到该产品所在行数后，读取该行的 **AE 列** 值。