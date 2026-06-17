# Knife E-Commerce 代码安全审计报告

**审计日期**: 2026-06-17  
**审计范围**: `/workspace/knife-ecommerce/src/` 全部源代码  
**审计方法**: 逐文件人工审查 + 模式匹配分析

---

## 一、Authentication & Session（认证与会话）

### V-01 [High] security.ts 中存在弱密码哈希实现（与 password.ts 竞争）
- **文件**: `/workspace/knife-ecommerce/src/lib/security.ts` 第 85-98 行
- **描述**: `security.ts` 中导出了 `hashPassword` 和 `verifyPassword` 函数，使用 `sha256(password + salt)` 进行哈希。SHA-256 是快速哈希算法，不适合密码存储，易受暴力破解攻击。虽然 `password.ts` 中有正确的 scrypt 实现，但 `security.ts` 中的弱实现仍然被导出，可能被其他模块误用。
- **修复建议**: 删除 `security.ts` 中的 `hashPassword` 和 `verifyPassword` 函数，统一使用 `password.ts` 中的 scrypt 实现。

### V-02 [Medium] Refresh Token 未持久化验证
- **文件**: `/workspace/knife-ecommerce/src/lib/auth.ts` 第 85 行
- **描述**: `setAuthCookies` 中设置了 `refresh_token` cookie，但 `refresh_token` 仅是 `randomBytes(32).toString('hex')`，没有在服务端存储或关联到用户会话。refresh token 没有被任何端点验证或使用，实际上是一个无效的刷新机制。
- **修复建议**: 要么实现完整的 refresh token 轮换机制（存储在数据库中），要么移除 refresh token 以避免误导。

### V-03 [Medium] 修改密码时密码强度要求不一致
- **文件**: `/workspace/knife-ecommerce/src/app/api/user/profile/route.ts` 第 84 行
- **描述**: 修改密码时仅要求 `newPassword.length < 8`，而注册和重置密码时要求 12 字符且包含大小写、数字和特殊字符。密码修改端点的策略明显弱于注册端点。
- **修复建议**: 在 `profile/route.ts` 的密码修改逻辑中添加与注册一致的密码强度验证（12字符+大小写+数字+特殊字符）。

### V-04 [Low] 登录失败信息一致性良好（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/app/api/auth/login/route.ts` 第 46, 78 行
- **描述**: 登录失败时返回 "Incorrect email or password"，不区分是邮箱不存在还是密码错误，有效防止了账户枚举。

### V-05 [Low] 验证码使用 Math.random() 生成
- **文件**: `/workspace/knife-ecommerce/src/lib/verificationCode.ts` 第 24 行
- **描述**: `generateCode()` 使用 `Math.random()` 生成6位验证码。`Math.random()` 不是密码学安全的随机数生成器，理论上可预测。
- **修复建议**: 使用 `crypto.randomInt(100000, 999999)` 替代 `Math.floor(100000 + Math.random() * 900000)`。

### V-06 [Low] 订单号使用 Math.random()
- **文件**: `/workspace/knife-ecommerce/src/lib/utils.ts` 第 22 行
- **描述**: `generateOrderNumber()` 中使用 `Math.random().toString(36)` 生成订单号随机部分，可预测。
- **修复建议**: 使用 `crypto.randomBytes(4).toString('hex').toUpperCase()` 替代。

---

## 二、Input Validation & Injection（输入验证与注入）

### V-07 [Low] SQL 注入防护良好（正面发现）
- **文件**: 所有数据库查询文件
- **描述**: 所有数据库查询均使用 `pg` 库的参数化查询（`$1, $2` 占位符），未发现 SQL 注入漏洞。

### V-08 [Medium] XSS 防护依赖 middleware WAF，部分端点缺少输出编码
- **文件**: `/workspace/knife-ecommerce/src/app/api/admin/bank-import/route.ts` 第 282-311 行
- **描述**: 银行导入摘要邮件的 HTML 中，`processed.map(p => ...)` 和 `ambiguous.map(a => ...)` 的内容直接插入 HTML 模板，未经过 `escapeHtml` 处理。虽然 `amount.toFixed(2)` 是安全的数字，但 `reason` 字段包含来自 CSV 解析的字符串，可能包含恶意 HTML。
- **修复建议**: 对 `reason` 字段应用 `escapeHtml()` 函数后再插入 HTML 模板。

### V-09 [Low] 命令注入防护良好（正面发现）
- **文件**: 全部源代码
- **描述**: 代码中没有使用 `child_process`、`exec`、`spawn` 等命令执行函数，不存在命令注入风险。

### V-10 [Low] SSRF 防护完善（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/lib/ssrfProtection.ts`
- **描述**: 实现了完整的 SSRF 防护，包括私有 IP 检测、协议白名单、URL 解码循环检测。middleware 中也对 `/_next/image` 的 URL 参数进行了 SSRF 检查。

### V-11 [Low] 路径遍历防护良好（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/middleware.ts`
- **描述**: middleware 中实现了全面的路径遍历检测模式，包括多种编码变体（URL编码、双重URL编码、Unicode等）。

---

## 三、CSRF（跨站请求伪造）

### V-12 [Medium] CSRF Token 验证未在 API 路由中强制执行
- **文件**: `/workspace/knife-ecommerce/src/middleware/csrf.ts` 和各 API 路由
- **描述**: 虽然 `csrf.ts` 中实现了完整的 CSRF 保护中间件（`csrfProtection` 函数），但**没有任何 API 路由实际调用此函数**。middleware.ts 中的 `validateCSRF` 函数仅检查 Origin/Referer 头，不验证 CSRF token。这意味着 double-submit cookie 模式的 CSRF 保护实际上未生效。
- **修复建议**: 在关键状态变更端点（order/create, user/profile, user/addresses, user/data DELETE 等）中显式调用 `csrfProtection()` 中间件，或在 middleware 中集成 CSRF token 验证。

### V-13 [Low] Origin/Referer 验证存在但可被绕过
- **文件**: `/workspace/knife-ecommerce/src/middleware.ts` 第 1149-1181 行
- **描述**: CSRF 保护依赖 Origin 和 Referer 头验证。如果两者都缺失且 `sec-fetch-site` 不是 `same-origin` 或 `same-site`，请求会被拒绝。但某些移动端浏览器可能不发送这些头，导致合法请求被拦截（可用性问题），或者攻击者可能通过 `sec-fetch-site` 头伪造绕过。
- **修复建议**: 实现真正的 CSRF token 验证（double-submit cookie 模式），而非仅依赖 Origin/Referer。

---

## 四、Access Control（访问控制）

### V-14 [Medium] /api/order/update-status 端点普通用户可更新自己的订单状态
- **文件**: `/workspace/knife-ecommerce/src/app/api/order/update-status/route.ts` 第 55 行
- **描述**: 该端点允许订单所有者（`order.user_id === payload.userId`）更新订单状态为 'paid'、'shipped' 等。普通用户可以将自己的订单状态改为 'paid' 而无需实际付款，这是一个严重的业务逻辑漏洞。
- **修复建议**: 订单状态更新应仅限管理员操作，移除普通用户的权限。

### V-15 [Low] Admin 路由保护完善（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/lib/adminGuard.ts`
- **描述**: `requireAdmin()` 函数实现了多层保护：JWT 验证 -> 数据库角色查询 -> Admin PIN 验证 -> TOTP 验证。不信任客户端 role 标志，从数据库重新查询。

### V-16 [Low] Bank Import 端点保护良好（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/app/api/admin/bank-import/route.ts` 第 208 行
- **描述**: Bank Import 端点验证了 JWT 和 admin 角色。

---

## 五、Data Protection（数据保护）

### V-17 [Medium] 硬编码邮箱地址作为默认值
- **文件**: `/workspace/knife-ecommerce/src/lib/orderEmail.ts` 第 31 行
- **描述**: `getOrderReceiverEmail()` 中默认返回 `'rjyy_88@qq.com'`。虽然可通过环境变量覆盖，但硬编码的邮箱地址暴露在源代码中。
- **修复建议**: 移除硬编码默认值，在未配置环境变量时抛出错误或返回空值。

### V-18 [Medium] 硬编码银行账号信息
- **文件**: `/workspace/knife-ecommerce/src/lib/orderEmail.ts` 第 33-39 行
- **描述**: `getPrivateBankDetails()` 中硬编码了默认银行账号 `'147-6411161-838'`、银行名称 `'HSBC'` 等。这些敏感金融信息暴露在源代码中。
- **修复建议**: 移除所有硬编码的金融信息，必须通过环境变量配置。

### V-19 [Low] PII 数据脱敏良好（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/app/api/user/data/route.ts`
- **描述**: 用户数据导出端点对姓名、邮箱、电话、地址等 PII 字段进行了脱敏处理。

### V-20 [Low] 密码重置邮件中包含原始 reset URL
- **文件**: `/workspace/knife-ecommerce/src/app/api/auth/forgot-password/route.ts` 第 126 行
- **描述**: 密码重置链接中包含原始 token（非哈希），这是正确做法——token 仅通过邮件传递，数据库中仅存储哈希值。

---

## 六、Rate Limiting（速率限制）

### V-21 [Medium] 速率限制存储在内存中，多实例部署无效
- **文件**: 多个文件（`middleware.ts`, `apiProtection.ts`, `authRateLimit.ts`, `sensitiveRateLimit.ts`, `verificationCode.ts`）
- **描述**: 所有速率限制数据存储在 JavaScript 内存对象/Map 中。在 Vercel 等 Serverless 环境中，每个请求可能在不同的实例中执行，内存不共享，导致速率限制可被绕过。
- **修复建议**: 使用 Redis 或 Upstash Redis 等外部存储实现分布式速率限制。

### V-22 [Low] 速率限制覆盖全面（正面发现）
- **文件**: 多个文件
- **描述**: 代码实现了多层速率限制：middleware 全局限制、API 保护层限制、认证端点专用限制、敏感操作限制。包括滑动窗口、渐进式封禁等高级策略。

---

## 七、Error Handling（错误处理）

### V-23 [Medium] 部分端点错误处理中可能泄露信息
- **文件**: `/workspace/knife-ecommerce/src/app/api/auth/register/route.ts` 第 138 行
- **描述**: `console.error('[register] unhandled error', err)` 在 catch 块中记录了完整的错误对象 `err`，可能包含数据库连接字符串、查询细节等敏感信息。
- **修复建议**: 仅记录错误消息和类型，不记录完整的错误对象。

### V-24 [Low] 错误处理中间件完善（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/middleware/errorHandler.ts`
- **描述**: 实现了完善的错误处理中间件，生产环境不暴露堆栈跟踪和内部错误消息，开发环境提供详细调试信息。

---

## 八、Dependencies（依赖安全）

### V-25 [Medium] Next.js 版本过新，可能存在未知漏洞
- **文件**: `/workspace/knife-ecommerce/package.json` 第 16 行
- **描述**: 使用 `"next": "^16.2.9"`。Next.js 16 是非常新的版本（可能尚未正式发布或刚发布），可能存在未知安全漏洞。建议使用经过充分测试的 LTS 版本。
- **修复建议**: 评估 Next.js 16 的稳定性，考虑使用 Next.js 15 的最新稳定版本。

### V-26 [Low] 依赖版本整体合理
- **文件**: `/workspace/knife-ecommerce/package.json`
- **描述**: 其他依赖（react, pg, nodemailer, twilio, zod）均使用较新版本，未发现已知重大漏洞的旧版本。

---

## 九、Configuration（配置安全）

### V-27 [High] SSL 证书验证被禁用
- **文件**: `/workspace/knife-ecommerce/src/lib/db.ts` 第 33 行
- **描述**: PostgreSQL 连接配置中 `ssl: { rejectUnauthorized: false }` 禁用了 SSL 证书验证。这使得数据库连接容易受到中间人攻击（MITM）。
- **修复建议**: 配置正确的 SSL CA 证书，设置 `rejectUnauthorized: true`，或使用环境变量控制。

### V-28 [Medium] Google Analytics ID 回退到硬编码值
- **文件**: `/workspace/knife-ecommerce/src/app/layout.tsx` 第 101, 108 行
- **描述**: `process.env.NEXT_PUBLIC_GA_ID || 'G-XXXXXXXXXX'` 在环境变量未设置时使用占位符值。虽然不会导致安全漏洞，但可能在生产环境中发送数据到无效的 GA 跟踪 ID。
- **修复建议**: 在生产环境中确保 GA ID 已配置，或移除回退值。

### V-29 [Low] 安全头配置完善（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/middleware.ts` 第 1281-1313 行
- **描述**: 实现了全面的安全响应头，包括 CSP、HSTS、X-Frame-Options、X-Content-Type-Options、COOP、CORP、COEP 等。使用 nonce-based CSP。

### V-30 [Low] CORS 配置合理（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/middleware.ts`
- **描述**: 通过 Origin/Referer 白名单验证实现 CORS 保护，允许的域名包括自身域名、社交平台域名和 Vercel 域名。

---

## 十、Business Logic（业务逻辑）

### V-31 [High] 订单状态可被普通用户篡改为"已付款"
- **文件**: `/workspace/knife-ecommerce/src/app/api/order/update-status/route.ts` 第 55 行
- **描述**: 同 V-14。普通用户可以通过调用 `POST /api/order/update-status` 将自己的订单状态从 'pending' 改为 'paid'，从而绕过实际支付。这将触发付款确认邮件通知管理员，管理员可能误以为已收到付款。
- **修复建议**: 移除 `order.user_id === payload.userId` 条件，仅允许 admin 角色更新订单状态。

### V-32 [Medium] 订单创建无库存扣减（竞态条件）
- **文件**: `/workspace/knife-ecommerce/src/app/api/order/create/route.ts`
- **描述**: 订单创建时仅检查产品是否存在和 MOQ，不扣减库存。虽然产品数据中 `stock: 999999` 似乎是硬编码的无限库存，但如果将来改为真实库存，将存在超卖风险。
- **修复建议**: 使用数据库事务和 `SELECT ... FOR UPDATE` 实现库存扣减，或使用乐观锁。

### V-33 [Medium] 优惠券系统硬编码且无使用限制
- **文件**: `/workspace/knife-ecommerce/src/lib/payment.ts` 第 76-79 行
- **描述**: 优惠券代码 `WELCOME10` 和 `SAVE50` 硬编码在源代码中，无使用次数限制、无有效期、无用户使用限制。虽然此模块似乎未在订单创建流程中实际使用（order/create 使用自己的价格计算），但如果被集成，将存在优惠券滥用风险。
- **修复建议**: 将优惠券存储在数据库中，添加使用次数限制和有效期。

### V-34 [Low] 订单价格服务端验证良好（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/app/api/order/create/route.ts` 第 338-370 行
- **描述**: 订单创建时，价格完全从服务端产品数据源获取，不接受客户端传入的价格。有效防止了价格篡改。

---

## 十一、File Operations（文件操作）

### V-35 [Low] 文件上传缺少文件类型验证
- **文件**: `/workspace/knife-ecommerce/src/app/api/admin/bank-import/route.ts` 第 212-218 行
- **描述**: Bank Import 端点接受文件上传，但仅通过 `formData.get('file')` 获取文件，未验证文件类型（如是否为 CSV）、文件大小或文件内容。虽然 middleware 中有恶意扩展名检测，但仅在 `/upload` 路径上生效。
- **修复建议**: 添加文件类型白名单验证（仅允许 `.csv`, `.txt`），添加文件大小限制。

### V-36 [Low] 文件操作端点极少（正面发现）
- **描述**: 代码中几乎没有文件读写操作，仅 bank-import 端点读取上传的 CSV 文本内容。不存在路径遍历风险。

---

## 十二、API Security（API 安全）

### V-37 [Medium] API 路由缺少统一的请求体大小限制
- **文件**: 多个 API 路由
- **描述**: 虽然 `errorHandler.ts` 中 `parseJSONBody` 提供了大小限制（默认 10KB），但大多数 API 路由直接调用 `request.json()` 而不使用此函数。middleware 中有 DDoS 保护（10MB 限制），但单个 API 端点缺少精确的请求体大小限制。
- **修复建议**: 在所有接受 JSON body 的端点中使用 `parseJSONBody` 或添加 content-length 检查。

### V-38 [Medium] /api/auth/login 端点未使用 parseJSONBody
- **文件**: `/workspace/knife-ecommerce/src/app/api/auth/login/route.ts` 第 22 行
- **描述**: 直接调用 `await request.json()` 而不限制请求体大小，可能导致大 payload 攻击。
- **修复建议**: 使用 `parseJSONBody` 函数替代直接 `request.json()` 调用。

### V-39 [Low] Content-Type 验证在 middleware 中实现（正面发现）
- **文件**: `/workspace/knife-ecommerce/src/middleware.ts` 第 1114-1121 行
- **描述**: middleware 对 POST/PUT/PATCH 请求验证 Content-Type，仅允许 `application/json`、`application/x-www-form-urlencoded`、`multipart/form-data`、`text/plain`。

---

## 漏洞统计

| 严重程度 | 数量 |
|---------|------|
| Critical | 0 |
| High | 2 |
| Medium | 12 |
| Low | 17 |

### High 级别漏洞汇总
1. **V-01**: `security.ts` 中存在弱密码哈希实现（SHA-256），可能被误用
2. **V-31/V-14**: 普通用户可将订单状态改为"已付款"，绕过支付流程

### Medium 级别漏洞汇总
1. **V-02**: Refresh Token 未实现验证机制
2. **V-03**: 修改密码时强度要求不一致（8字符 vs 12字符）
3. **V-08**: 银行导入邮件 HTML 中未转义 reason 字段
4. **V-12**: CSRF Token 验证未在 API 路由中实际执行
5. **V-17**: 硬编码邮箱地址
6. **V-18**: 硬编码银行账号信息
7. **V-21**: 内存速率限制在 Serverless 环境中无效
8. **V-23**: 错误日志中可能泄露敏感信息
9. **V-25**: Next.js 16 版本可能不稳定
10. **V-27**: PostgreSQL SSL 证书验证被禁用
11. **V-32**: 订单创建无库存扣减（潜在竞态条件）
12. **V-33**: 优惠券系统硬编码无限制
13. **V-37/V-38**: API 端点缺少请求体大小限制

---

## 正面发现（安全措施良好之处）

1. **参数化 SQL 查询**: 所有数据库查询使用 `$1, $2` 参数化，无 SQL 注入风险
2. **密码哈希**: `password.ts` 使用 scrypt（64字节密钥，16字节随机盐）+ timing-safe 比较
3. **JWT 实现**: 自定义 JWT 使用 HMAC-SHA256 + timing-safe 签名验证，强制算法检查
4. **Cookie 安全**: httpOnly, secure(生产环境), sameSite=strict
5. **WAF 防护**: middleware 实现了全面的 WAF，包括多编码层解码检测
6. **PII 脱敏**: 用户数据导出时对姓名、邮箱、电话、地址进行脱敏
7. **Admin 多因素认证**: PIN + TOTP + IP 白名单多层保护
8. **安全响应头**: CSP(nonce), HSTS, X-Frame-Options, COOP, CORP, COEP 等
9. **暴力破解防护**: 渐进式封禁 + 机器人检测 + 每日自动解锁
10. **密码重置安全**: 使用哈希存储 token，30分钟过期，单次使用
11. **验证码安全**: 1分钟过期，最多3次尝试，SHA-256 哈希存储
12. **订单价格验证**: 服务端价格计算，不接受客户端价格
13. **SSRF 防护**: 私有 IP 检测 + 协议白名单 + 多层解码
14. **反枚举**: 登录失败返回通用错误信息，密码重置始终返回成功
15. **GDPR 合规**: 支持用户数据导出和软删除

---

## 优先修复建议

1. **[紧急]** 修复 V-31: 移除普通用户更新订单状态的权限
2. **[紧急]** 修复 V-27: 启用 PostgreSQL SSL 证书验证
3. **[高优先级]** 修复 V-01: 删除 security.ts 中的弱哈希实现
4. **[高优先级]** 修复 V-12: 在 API 路由中集成 CSRF token 验证
5. **[高优先级]** 修复 V-03: 统一密码强度要求
6. **[中优先级]** 修复 V-17/V-18: 移除硬编码的敏感信息
7. **[中优先级]** 修复 V-21: 使用 Redis 实现分布式速率限制
8. **[中优先级]** 修复 V-37/V-38: 统一使用 parseJSONBody 限制请求体大小
