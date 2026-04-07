# /resolve-conflict - Giải Quyết Git Conflicts Toàn Diện

## CÁCH DÙNG
```

/resolve-conflict <file_path>

```

## MỤC TIÊU
Phân tích git conflict một cách toàn diện, đánh giá tác động đến toàn bộ codebase, đề xuất giải pháp đảm bảo code hoạt động đúng và không có lỗi kỹ thuật.

---

## 0. CHUẨN BỊ & NGUYÊN TẮC

### 0.1 Tuân Thủ Project Rules
**HÀNH ĐỘNG:** Đọc `.cursorrules` và project conventions trước khi analyze.

**Kiểm tra:**
- Coding conventions (naming, structure)
- Logging policy (logger usage)
- Import/export patterns
- Comment/documentation style (TSDoc, JSDoc, etc.)
- Merge preferences nếu có

**LƯU Ý:** Giải pháp merge PHẢI tuân thủ conventions này.

### 0.2 Tool Access & Fallbacks

**Priority 1 - Git commands (nếu available):**
```


# Test git access

git status

# Lấy versions với đường dẫn tuyệt đối

git show :1:/absolute/path/to/file > /tmp/base-$(basename file).tmp
git show :2:/absolute/path/to/file > /tmp/ours-$(basename file).tmp
git show :3:/absolute/path/to/file > /tmp/theirs-\$(basename file).tmp

# Đọc bằng read_file

read_file /tmp/base-file.tmp
read_file /tmp/ours-file.tmp
read_file /tmp/theirs-file.tmp

```

**Fallback - Không có git access:**
```

Parse conflict markers trong file hiện tại:

- <<<<<<< HEAD đến ======= là OURS
- ======= đến >>>>>>> branch là THEIRS
- Không có base → so sánh trực tiếp ours vs theirs

```

**Cleanup:** Xóa temp files sau khi done.

### 0.3 Output Guidelines

**File ≤ 400 lines:**
- Output full merged code

**File > 400 lines:**
- Output conflict regions + context (±10 lines)
- Provide diff format
- Hướng dẫn apply changes

### 0.4 Dependency Analysis Strategy

**KHÔNG skip nếu:**
- File exports functions/classes/constants
- File là core/service layer
- Conflict ở logic layer có thể ảnh hưởng callers

**Có thể giảm scope nếu:**
- File là utility đơn giản
- Chỉ có style/formatting conflicts
- Không tìm thấy external usage sau quick scan

**Time budget:** Max 3 phút cho dependency analysis

---

## BƯỚC 1: Thu Thập Dữ Liệu Conflict

### 1.1 Lấy Đủ Các Phiên Bản

**Cần lấy 4 versions:**
1. **BASE** (common ancestor) - Nếu có
2. **OURS** (HEAD current branch)
3. **THEIRS** (incoming branch)
4. **CURRENT** (file với conflict markers)

**Định dạng output:**
```

FILE: /absolute/path/to/file
SIZE: [N lines]
LANGUAGE: [Python/JavaScript/etc.]

═══ BASE (Common Ancestor) ═══
[Content hoặc "Not available"]

═══ OURS (Current Branch) ═══
[Content]

═══ THEIRS (Incoming Branch) ═══
[Content]

═══ CONFLICT REGIONS ═══
Region 1: Lines X-Y (Z lines conflict)
Region 2: Lines A-B (C lines conflict)
Total: [M regions]

```

### 1.2 Phân Loại Conflict

```

CONFLICT TYPE:

- [✓] Content: Cùng code block bị sửa khác nhau
- [✓] Structure: Thêm/xóa functions/classes
- [✓] Logic: Thay đổi business rules/flow
- [✓] Dependency: Khác biệt imports/interfaces

SEVERITY: [Low/Medium/High]
Lý do: [Giải thích severity]

```

---

## BƯỚC 2: Phân Tích Sự Khác Biệt

### 2.1 OURS vs BASE

```

OURS CHANGES (từ common ancestor):

THÊM MỚI:

+ Function/Class: [Tên]
    - Purpose: [Chức năng]
    - Lines: X-Y
    - Dependencies: [Imports/modules mới]
+ Logic block: [Mô tả]
    - Purpose: [Tại sao thêm]
    - Impact: [Ảnh hưởng gì]

SỬA ĐỔI:
~ Function [Tên]: [Thay đổi như thế nào]

- Before: [Logic cũ]
- After: [Logic mới]
- Impact: [Business logic/validation/flow thay đổi ra sao]

~ Variable [Tên]: [Type/value change]

XÓA BỎ:

- Function/Class [Tên]: [Lý do có thể suy luận]
- Code block: [Chức năng đã xóa]

TÁC ĐỘNG LOGIC:

- Business rules: [Thay đổi gì]
- Validation: [Thêm/sửa/xóa rules]
- Error handling: [Cách xử lý lỗi thay đổi]
- Side effects: [Ảnh hưởng state/external systems]

```

### 2.2 THEIRS vs BASE

```

THEIRS CHANGES (từ common ancestor):
[Same structure as 2.1]

```

### 2.3 Key Differences OURS vs THEIRS

```

ĐIỂM KHÁC BIỆT CHÍNH:

1. [Tên function/logic block]
OURS approach: [Mô tả cách xử lý]
THEIRS approach: [Mô tả cách xử lý]
Conflict vì: [Lý do không tương thích]
Có thể merge: [Yes/No - giải thích]
2. [Điểm khác biệt 2]
[Same format]

COMPATIBILITY MATRIX:
┌────────────────────┬──────────┬──────────┐
│ Component          │ Ours     │ Theirs   │
├────────────────────┼──────────┼──────────┤
│ Imports            │ [List]   │ [List]   │
│ Function sigs      │ [Changes]│ [Changes]│
│ Return types       │ [Types]  │ [Types]  │
│ Side effects       │ [Yes/No] │ [Yes/No] │
└────────────────────┴──────────┴──────────┘

PHẦN CÓ THỂ MERGE TỰ ĐỘNG:

- [List phần không conflict thực sự]

PHẦN CONFLICT THỰC SỰ:

- [List phần cần quyết định manual]

PHẦN BỔ SUNG CHO NHAU:

- [List phần có thể combine cả hai]

```

---

## BƯỚC 3: Phân Tích Dependencies & Impact

### 3.1 Tìm Files Liên Quan

**HÀNH ĐỘNG:** Comprehensive scan files phụ thuộc vào conflict file.

**Dùng tools:**
```


# Tìm files import từ conflict file

codebase_search "import.*from.*<conflict_file_name>"
codebase_search "require.*<conflict_file_name>"

# Tìm usage của functions/classes trong conflict

codebase_search "<function_name>"
codebase_search "<ClassName>"

# Tìm files được import bởi conflict file

grep -r "import.*<exported_name>" .

```

**Output:**
```

FILES LIÊN QUAN TRỰC TIẾP:

1. File: <path/to/file1>
Relationship:
    - Import: [List symbols imported từ conflict file]
    - Gọi functions: [List function calls]
    - Uses classes: [List classes used]

Usage details:
    - Function X được dùng ở: [Lines]
    - Class Y được inherit/instantiate ở: [Lines]

Impact level: [High/Medium/Low]
Lý do: [Giải thích level]
2. File: <path/to/file2>
[Same format]

FILES LIÊN QUAN GIÁN TIẾP:
[Files phụ thuộc vào direct dependent files]

DEPENDENCY MAP:

```
[conflict file] ← file1, file2 (direct dependents)
                  ↑
                  file3, file4 (indirect dependents)

[conflict file] → moduleA, moduleB (dependencies của conflict file)
```


### 3.2 Check Conflict Status Của Related Files

**HÀNH ĐỘNG:** Kiểm tra files liên quan có conflicts không.

```bash
# List all conflicted files
git diff --name-only --diff-filter=U

# Chi tiết conflicts trong related files
git diff --check
```

**Output:**

```
RELATED FILES CONFLICT STATUS:

Files CÓ conflict:
───────────────────
1. <file1>
   Status: HAS CONFLICT
   Conflict type: [Content/Structure/Logic]
   Conflict lines: [X-Y, A-B]
   
   Liên quan đến conflict hiện tại:
   ✓ YES - [Giải thích mối liên hệ cụ thể]
   - Function Z trong conflict file được gọi ở lines [X]
   - Nếu chọn OURS cho conflict file → file1 conflict cần resolve theo hướng [...]
   - Nếu chọn THEIRS cho conflict file → file1 conflict cần resolve theo hướng [...]
   
   Priority: [High/Medium/Low]
   Lý do: [...]

2. <file2>
   [Same format]

Files KHÔNG conflict:
──────────────────────
1. <file3>
   Status: CLEAN
   Actions needed: 
   - Verify compatibility sau khi resolve conflict file
   - Check: [Specific checks needed]

RESOLUTION SEQUENCE (nếu có dependencies):
────────────────────────────────────────────
Đề xuất thứ tự resolve:
1. Resolve <file1> trước
   Lý do: [Conflict file phụ thuộc vào file1, cần biết contract trước]
   
2. Resolve <conflict file> 
   Lý do: [Base trên decisions từ file1]
   
3. Resolve <file2>
   Lý do: [Phụ thuộc vào decisions của conflict file]
```


### 3.3 Cross-Reference Analysis

**HÀNH ĐỘNG:** Phân tích sâu mối liên hệ giữa conflicts.

```
CROSS-REFERENCE ANALYSIS:

Symbols trong conflict file:
─────────────────────────────

Function: functionName
- Được dùng ở files: [file1:lines, file2:lines]
- Files đó conflict status: [file1: YES, file2: NO]

Nếu chọn OURS:
  → functionName signature: [signature]
  → file1 (có conflict): Cần chọn version tương thích [ours/theirs/custom]
  → file2 (clean): Vẫn hoạt động [OK/Cần update - giải thích]
  → Breaking changes: [None/List changes]

Nếu chọn THEIRS:
  → functionName signature: [signature]
  → file1 (có conflict): Cần chọn version tương thích [ours/theirs/custom]
  → file2 (clean): Vẫn hoạt động [OK/Cần update - giải thích]
  → Breaking changes: [None/List changes]

Class: ClassName
[Same analysis]

CONSISTENCY CHECK:
──────────────────
✓/✗ Chọn OURS ở đây consistent với:
    - Related file1: [Current decision or pending]
    - Related file2: [Current decision or pending]

✓/✗ Chọn THEIRS ở đây consistent với:
    - Related file1: [Current decision or pending]
    - Related file2: [Current decision or pending]

CIRCULAR DEPENDENCIES (nếu có):
────────────────────────────────
Detected: [file A ↔ file B ↔ conflict file]
Impact: [Cả 3 files đều conflict]
Recommendation: [Thứ tự resolve để break cycle]
```


***

## BƯỚC 4: Đánh Giá Chi Tiết Từng Phương Án

### 4.1 Scenario: ACCEPT OURS

```
═══════════════════════════════════════════
SCENARIO 1: ACCEPT OURS
═══════════════════════════════════════════

GIỮ LẠI (từ ours):
───────────────────
- [Feature/Function X: Chức năng]
- [Logic Y: Cách xử lý]
- [Changes Z: Improvements]

MẤT ĐI (từ theirs bị discard):
────────────────────────────────
- [Feature/Function A: Chức năng sẽ mất]
- [Logic B: Approach khác sẽ không có]
- [Changes C: Improvements không được apply]

TÁC ĐỘNG TÍCH CỰC:
───────────────────
✓ [Benefit 1: Mô tả lợi ích]
✓ [Benefit 2]
✓ [Benefit 3]

TÁC ĐỘNG TIÊU CỰC & RỦI RO:
────────────────────────────
⚠️ Risk 1: [Mô tả risk cụ thể]
   Severity: [High/Medium/Low]
   Probability: [High/Medium/Low]
   Impact: [Mô tả tác động]
   Mitigation: [Cách xử lý/phòng tránh]

⚠️ Risk 2: [...]

BREAKING CHANGES:
──────────────────
- [None/List changes làm break existing code]

FILES LIÊN QUAN CẦN CHECK:
───────────────────────────
1. <file1>: 
   - Reason: [Tại sao cần check]
   - Check: [Cụ thể cần verify gì]
   - Action: [Cần update hay chỉ verify]

2. <file2>: [...]

CODE QUALITY ISSUES:
────────────────────
✓/✗ Unused imports: [None/List]
✓/✗ Dead code: [None/Describe]
✓/✗ Duplicate logic: [None/Where]
✓/✗ Error handling: [Complete/Missing: where]
✓/✗ Edge cases: [Covered/Missing: which]

TESTS CẦN UPDATE:
─────────────────
- <test_file1>: [Changes needed]
  - Test cases to add: [List]
  - Test cases to update: [List]
  - Test cases to remove: [List]

DOCUMENTATION CẦN UPDATE:
──────────────────────────
- README: [Sections to update]
- API docs: [Endpoints/functions to document]
- Comments: [Where to add/update]

OVERALL RISK LEVEL: [Low/Medium/High]
```


### 4.2 Scenario: ACCEPT THEIRS

```
═══════════════════════════════════════════
SCENARIO 2: ACCEPT THEIRS
═══════════════════════════════════════════
[Same detailed structure as 4.1]
```


### 4.3 Scenario: CUSTOM MERGE

```
═══════════════════════════════════════════
SCENARIO 3: CUSTOM MERGE (OURS + THEIRS)
═══════════════════════════════════════════

FEASIBILITY: [Easy/Moderate/Hard]

Lý do rating:
- [Reason 1]
- [Reason 2]

MERGE STRATEGY:
───────────────

1. Giữ từ OURS:
   Lines X-Y: [Function/block name]
   Lý do: [Tại sao giữ ours cho phần này]
   
2. Giữ từ THEIRS:
   Lines A-B: [Function/block name]
   Lý do: [Tại sao giữ theirs cho phần này]
   
3. Kết hợp cả hai:
   Lines M-N: [Function/block name]
   Approach: [Mô tả cách combine]
   Lý do: [Tại sao cần combine]

4. Điều chỉnh custom:
   Lines P-Q: [Function/block name]
   Changes: [Modifications needed]
   Lý do: [Tại sao cần adjust]

CONFLICTS CẦN RESOLVE MANUALLY:
────────────────────────────────
1. [Conflict point 1]:
   - OURS: [Approach]
   - THEIRS: [Approach]
   - Proposed: [How to handle]
   - Reason: [Why this way]

2. [Conflict point 2]: [...]

INTEGRATION CHALLENGES:
───────────────────────
1. Challenge: [Mô tả vấn đề khi merge]
   Solution: [Cách xử lý]
   
2. Challenge: [Type mismatch/Order issues/etc.]
   Solution: [...]

CODE QUALITY POST-MERGE:
────────────────────────
✓/✗ No conflicting imports
✓/✗ No duplicate functions/logic
✓/✗ Consistent error handling
✓/✗ All variables defined
✓/✗ No unreachable code

TÁC ĐỘNG & RỦI RO:
──────────────────
[Same format as 4.1]

OVERALL FEASIBILITY: [Easy/Moderate/Hard]
```


***

## BƯỚC 5: Recommendation \& Merged Code

### 5.1 Quyết Định Cuối Cùng

```
═══════════════════════════════════════════
💡 RECOMMENDATION
═══════════════════════════════════════════

PHƯƠNG ÁN ĐỀ XUẤT: [OURS / THEIRS / CUSTOM MERGE]

LỶ DO CHÍNH:
────────────
1. [Reason 1 - dựa trên requirements]
2. [Reason 2 - dựa trên dependencies]
3. [Reason 3 - dựa trên code quality/risks]

ĐỘ TIN CẬY: [High/Medium/Low]
────────────
- High: Rõ ràng phương án này tốt nhất
- Medium: Có trade-offs, nhưng option này reasonable
- Low: Cần input từ developer để quyết định

TRADE-OFFS CẦN CHẤP NHẬN:
─────────────────────────
- [Trade-off 1]
- [Trade-off 2]
```

**Nếu confidence LOW:**

```
⚠️ CẦN THÊM THÔNG TIN ĐỂ QUYẾT ĐỊNH

Questions cần clarify:
1. [Question 1]
2. [Question 2]

Interim: Đã analyze cả 3 scenarios chi tiết ở trên.
Developer có thể chọn dựa trên context/priorities.
```


### 5.2 Merged Code Proposal

**Nếu file ≤ 400 lines:**

```
═══════════════════════════════════════════
📝 PROPOSED MERGED CODE
═══════════════════════════════════════════

```

[FULL merged file content - tuân thủ project conventions]

```

CHANGES EXPLAINED:
──────────────────
Lines X-Y: [Component name]
  Source: OURS
  Reason: [Why kept ours]
  
Lines A-B: [Component name]
  Source: THEIRS
  Reason: [Why kept theirs]
  
Lines M-N: [Component name]
  Source: CUSTOM (modified from both)
  Reason: [Why needed modification]
  Changes: [Describe modifications]

IMPORTS FINALIZED:
──────────────────
Added:
+ [import statement] - [Reason]

Kept from ours:
  [import statement]

Kept from theirs:
  [import statement]

Removed:
- [import statement] - [Reason: unused/duplicate]

CODE QUALITY VERIFIED:
──────────────────────
✓ No syntax errors
✓ All imports used
✓ No dead code
✓ No duplicate logic
✓ Error handling complete
✓ Consistent with project conventions
✓ All referenced symbols defined
```

**Nếu file > 400 lines:**

```
═══════════════════════════════════════════
📝 MERGED CODE (Diff Format)
═══════════════════════════════════════════

FILE TOO LARGE - Showing conflict regions only

REGION 1 (Lines X-Y):
─────────────────────
Context before:
```

[5 lines before conflict]

```

CONFLICT RESOLVED:
```

- [ours version if not kept]
+ [theirs version if kept]
+ [or custom merged version]

```

Reason: [Why this resolution]

Context after:
```

[5 lines after conflict]

```

REGION 2 (Lines A-B):
[Same format]

APPLY INSTRUCTIONS:
───────────────────
Option 1 - Git apply:
```


# Save diff to file

cat > /tmp/conflict-resolution.patch << 'EOF'
[unified diff format]
EOF

# Apply patch

git apply /tmp/conflict-resolution.patch

```

Option 2 - Manual edit:
1. Open file at line X
2. Replace [...] with [...]
3. [Detailed step-by-step]
```


***

## BƯỚC 6: Validation \& Action Items

### 6.1 Static Validation Checks

```
PRE-COMMIT VALIDATION:
══════════════════════

IMPORTS:
────────
✓/✗ Tất cả imports cần thiết có đủ
✓/✗ Không có unused imports
✓/✗ Import paths correct
✓/✗ No circular imports
Findings: [None/List issues]

FUNCTIONS/CLASSES:
──────────────────
✓/✗ Tất cả functions được define đầy đủ
✓/✗ Function signatures consistent với usage
✓/✗ Return types match expectations
✓/✗ Classes complete với required methods
✓/✗ No duplicate function definitions
Findings: [None/List issues]

VARIABLES:
──────────
✓/✗ No undefined variables
✓/✗ Variable types consistent
✓/✗ No name conflicts/shadowing
✓/✗ All variables initialized before use
Findings: [None/List issues]

LOGIC FLOW:
───────────
✓/✗ No unreachable code
✓/✗ No infinite loops
✓/✗ All branches lead somewhere
✓/✗ Error handling in critical paths
✓/✗ No duplicate logic blocks
Findings: [None/List issues]

PROJECT CONVENTIONS:
────────────────────
✓/✗ Naming conventions followed
✓/✗ File structure matches project pattern
✓/✗ Logging done correctly (per .cursorrules)
✓/✗ Comments style consistent
✓/✗ Indentation/formatting correct
Findings: [None/List issues]
```


### 6.2 Dependency Validation

```
DEPENDENCY VALIDATION POST-MERGE:
══════════════════════════════════

EXPORTED FROM THIS FILE:
────────────────────────
1. [Function/Class name]
   Used by files: [file1, file2]
   Status after merge: 
   - file1: [✓ OK / ⚠️ Needs update - what]
   - file2: [✓ OK / ⚠️ Needs update - what]
   Signature changes: [None/Describe]
   Breaking: [Yes/No]

2. [Function/Class name]
   [Same format]

IMPORTED INTO THIS FILE:
────────────────────────
1. From [module]: [Symbol]
   Status: [✓ Available / ✗ Broken - reason]
   Action: [None/Update import/etc.]

2. [Same format]

BREAKING CHANGES SUMMARY:
─────────────────────────
[None / List all breaking changes with impact]

FILES REQUIRING UPDATES:
────────────────────────
1. <file1>
   Changes needed: [Specific changes]
   Priority: [High/Medium/Low]
   
2. <file2>
   [Same format]
```


### 6.3 Comprehensive Action Items

```
═══════════════════════════════════════════
🔧 ACTION ITEMS
═══════════════════════════════════════════

IMMEDIATE (bắt buộc trước commit):
───────────────────────────────────
1. [ ] Apply merged code vào file
   Method: [git apply/manual edit]
   
2. [ ] Remove tất cả conflict markers
   Check: grep -n "<<<<<<\|======\|>>>>>>" <file>
   
3. [ ] Verify syntax
   Command: [linter command for this file type]
   
4. [ ] Clean up temp files
   Command: rm /tmp/*-$(basename file).tmp

VERIFICATION (ngay sau immediate):
───────────────────────────────────
1. [ ] Run linter
   Command: [specific linter command]
   Expected: No errors
   
2. [ ] Run formatter
   Command: [specific formatter command]
   
3. [ ] Check imports
   - Verify all imports resolve
   - No unused imports warning
   
4. [ ] Verify function signatures
   - Check callers still compatible
   - No type errors

RELATED FILES (nếu có):
───────────────────────
1. [ ] Review <file1>
   Reason: [Uses functionX from conflict file]
   Check: [Specific checks]
   Action: [Update/Verify only]
   
2. [ ] Review <file2>
   [Same format]

TESTING:
────────
1. [ ] Run existing tests
   Command: [test command]
   Focus on: [specific test files/suites]
   
2. [ ] Update tests (nếu cần)
   Files: [list test files]
   Changes: [what to update]
   
3. [ ] Add new tests (nếu cần)
   For: [new functionality/edge cases]
   Coverage: [target coverage]
   
4. [ ] Manual testing
   Scenarios: [list scenarios to test manually]

RELATED CONFLICTS (nếu có):
───────────────────────────
Priority order to resolve:
1. [ ] <file1> - Priority: High
   Reason: [Must resolve before/after current file]
   Link: [How it relates to current]
   
2. [ ] <file2> - Priority: Medium
   [Same format]

DOCUMENTATION:
──────────────
1. [ ] Update README (nếu cần)
   Sections: [which sections]
   
2. [ ] Update API docs (nếu có changes)
   Affected: [endpoints/functions]
   
3. [ ] Add inline comments
   Where: [complex logic sections]
   
4. [ ] Update CHANGELOG
   Entry: [describe change]

FINAL VERIFICATION:
───────────────────
1. [ ] Full test suite pass
2. [ ] Code review (nếu team requires)
3. [ ] Merge commit message prepared
4. [ ] No remaining conflicts in repo
5. [ ] CI/CD pipeline green
```


***

## OUTPUT FINAL

```
═══════════════════════════════════════════
CONFLICT RESOLUTION SUMMARY
═══════════════════════════════════════════

FILE: /absolute/path/to/file
SIZE: [N lines]
CONFLICT TYPE: [Type]
SEVERITY: [Level]
REGIONS: [M conflict regions]

───────────────────────────────────────────
💡 RECOMMENDATION
───────────────────────────────────────────
DECISION: [OURS / THEIRS / CUSTOM MERGE]
CONFIDENCE: [High/Medium/Low]

KEY REASONS:
- [Reason 1]
- [Reason 2]
- [Reason 3]

───────────────────────────────────────────
📊 IMPACT ANALYSIS
───────────────────────────────────────────
Related files: [N files]
  - [X files] have conflicts (need coordination)
  - [Y files] clean (need verification only)

Breaking changes: [None / List]
Required updates: [N files need updates]

───────────────────────────────────────────
📝 MERGED CODE
───────────────────────────────────────────
[Full code or diff - based on file size]

───────────────────────────────────────────
✅ VALIDATION STATUS
───────────────────────────────────────────
Static checks: [✓ Pass / ⚠️ Issues found]
Dependencies: [✓ Compatible / ⚠️ Updates needed]
Code quality: [✓ Good / ⚠️ Concerns]

───────────────────────────────────────────
🔧 NEXT STEPS
───────────────────────────────────────────
Immediate: [N actions]
Verification: [M checks]
Related: [K files to handle]
Testing: [P test updates]

───────────────────────────────────────────
⚠️ RISKS & NOTES
───────────────────────────────────────────
[Important warnings, risks to accept, notes]

───────────────────────────────────────────
🔗 RELATED CONFLICTS
───────────────────────────────────────────
[List other conflicts to resolve, in priority order]
```


***

## SPECIAL CASES \& ERROR HANDLING

### Case 1: Không Access Được Git

```
⚠️ GIT COMMANDS UNAVAILABLE

Fallback strategy:
1. Parse conflict markers từ file hiện tại
2. Extract OURS (từ <<<<<<< đến =======)
3. Extract THEIRS (từ ======= đến >>>>>>>)
4. Proceed without BASE version
5. Analysis sẽ trực tiếp so sánh OURS vs THEIRS

Note: Recommendations may be less confident without BASE context.
```


### Case 2: File Binary

```
❌ BINARY FILE CONFLICT

File: <path>
Type: [image/video/compiled/etc.]

Cannot auto-analyze binary conflicts.

RECOMMENDATION:
- Inspect both versions manually
- Decide based on: [size/timestamp/source/purpose]
- Use: git checkout --ours <file>
  OR:  git checkout --theirs <file>
- Commit decision with clear message
```


### Case 3: Quá Nhiều Conflicts

```
⚠️ EXCESSIVE CONFLICTS: [N > 10] regions

FILE: <path>

SUGGESTION:
Option 1: Resolve incrementally
  - Start with critical functions
  - Commit after each major section
  - Priority regions: [list]

Option 2: Consider rebase/cherry-pick
  - May be cleaner than merge
  - Discuss with team

Option 3: Manual review
  - File may need refactoring
  - Conflicts indicate divergence

Current analysis: [Provide summary only, not full detail]
```


### Case 4: Circular Dependencies

```
🔄 CIRCULAR DEPENDENCY DETECTED

Files: [fileA ↔ fileB ↔ fileC]
All have conflicts related to shared interfaces.

RECOMMENDATION:
1. Resolve in order:
   a. <fileA>: [Why first]
   b. <current file>: [Based on fileA decision]
   c. <fileC>: [Last]

2. Or consider refactoring:
   - Extract shared interfaces
   - Break circular dependency
   - Discuss with team

Note: Consistency crucial across all three files.
```


### Case 5: Cannot Determine Best Solution

```
🤔 INSUFFICIENT INFORMATION

Đã analyze đầy đủ cả 3 scenarios.
Không đủ context để recommend cụ thể.

QUESTIONS NEED CLARIFYING:
1. [Question 1]
2. [Question 2]

ANALYSIS PROVIDED:
- Scenario OURS: [Pros/cons/risks]
- Scenario THEIRS: [Pros/cons/risks]
- Scenario CUSTOM: [Feasibility/approach]

DEVELOPER DECISION NEEDED based on:
- Feature priorities
- Product roadmap
- Team conventions
- Timeline constraints
```


***

## LƯU Ý QUAN TRỌNG

### Thời Gian \& Độ Sâu

- **Simple conflicts (< 50 lines):** Quick analysis, ~1-2 min
- **Medium conflicts (50-200 lines):** Standard analysis, ~2-4 min
- **Complex conflicts (> 200 lines):** Deep analysis, ~4-6 min
- **Nếu > 6 min:** Consider flagging for manual review


### Ưu Tiên Phân Tích

1. **High:** Core/service layer, breaking changes, multiple dependencies
2. **Medium:** Feature code, some dependencies
3. **Low:** Utils, styles, configs with minimal impact

### Best Practices

- **Preserve intent:** Understand cả hai branches' goals
- **Prefer composition:** Combine thay vì choose one nếu có thể
- **Maintain consistency:** Follow project patterns
- **Test-driven:** Recommend tests ngay trong action items
- **Document decisions:** Explain non-obvious choices
- **Think holistically:** Consider full codebase impact


### Output Quality Standards

- Clear recommendation với confidence level
- Actionable next steps
- Comprehensive risk assessment
- Code quality verified
- Dependencies mapped
- Tests identified
