# Trade Assistant — Project Context

این فایل مرجع سریع پروژه است تا در ادامه توسعه، بررسی شاخه‌ها و تصمیم‌های فنی دوباره از صفر انجام نشود.

## وضعیت بررسی

- تاریخ بررسی: 2026-08-08
- شاخه فعلی: `MultiPairTrading`
- آخرین commit شاخه فعلی: `6edf6df Rename extension for multi-pair trading`
- شاخه پایه اولیه: `main`، tag `v1.0.0`، commit `8df771e`
- شاخه چندکارگزاری: `AddGsBroker`، tag `v2.0.0`، commit `ee36231`
- وضعیت working tree هنگام بررسی: بدون تغییر محلی ثبت‌نشده

## تاریخچه شاخه‌ها

```text
main (v1.0.0)
  └─ AddGsBroker (v2.0.0)
       └─ MultiPairTrading
```

### `main`

نسخه اولیه اکستنشن است و برای کارگزاری‌های پارسیان و خبرگان طراحی شده بود. منطق کارگزاری در `ui.js` و تنظیمات host/API در `config.js` قرار داشت و نمادهای اختیار از DOM صفحه خوانده می‌شدند.

### `AddGsBroker`

این شاخه تغییر معماری مهمی دارد:

- اضافه‌شدن `broker-adapters.js` برای جداکردن تفاوت‌های کارگزاری‌ها.
- اضافه‌شدن profile برای پارسیان، خبرگان و گنجینه سپهر در `config.js`.
- اضافه‌شدن host permission و content-script matchهای گنجینه سپهر در `manifest.json`.
- پشتیبانی گنجینه سپهر از API زنجیره اختیار و همچنین DOM دیدبان برای quote/symbol.
- اضافه‌شدن منطق ساخت استراتژی اولیه برای پارسیان/خبرگان.
- تفکیک تعداد خرید و فروش در هر leg و تنظیمات ذخیره‌شونده UI.

### `MultiPairTrading`

تا این بررسی، تنها تغییر نسبت به `AddGsBroker` تغییر نام extension در `manifest.json` بوده است. بنابراین نام شاخه هدف است، اما مدل داده و UI فعلی هنوز **تک‌زوجی** است.

## معماری فعلی

```text
صفحه کارگزاری
    │
    ├─ content.js
    │    ├─ inject ui.html + ui.css داخل Shadow DOM
    │    └─ inject config.js → broker-adapters.js → ui.js
    │
    ├─ config.js
    │    └─ انتخاب profile بر اساس location.hostname
    │
    ├─ broker-adapters.js
    │    ├─ Parsian/Khobregan adapter
    │    └─ Ephoenix/Ganjineh Sepahr adapter
    │
    └─ ui.js
         ├─ state و eventهای UI
         ├─ دریافت نماد، quote و strategy
         ├─ محاسبه BuyReturn/OffsetReturn
         ├─ مانیتورینگ یک زوج A/B
         └─ اجرای سفارش‌های دو مرحله‌ای
```

## فایل‌ها و مسئولیت‌ها

| فایل | مسئولیت |
|---|---|
| `manifest.json` | Manifest V3، نسخه، host permission، matchها و resourceهای قابل دسترسی |
| `content.js` | بارگذاری پنل و اسکریپت‌ها در صفحه کارگزاری |
| `config.js` | profile هر host، نوع adapter، base URL، کلید session/auth و endpointها |
| `broker-adapters.js` | قرارداد عملیاتی کارگزاری: symbol، quote، position، strategy و order |
| `ui.html` | ساختار پنل stock/option و کنترل‌های زوج A/B |
| `ui.css` | ظاهر پنل Shadow DOM |
| `ui.js` | منطق برنامه، state، محاسبه، polling، مانیتورینگ و اجرای سفارش |
| `README.md` | راه‌اندازی و خلاصه قابلیت‌های فعلی |

## قرارداد فعلی adapter

`window.PPT_BROKER_ADAPTERS.create(config)` بر اساس `config.type` adapter می‌سازد.

متدهای مهم مشترک:

- `searchInstruments(query)`
- `placeStockOrder({ instrument, side, price, quantity })`
- `getOptionSymbols()`
- `getOptionQuote(instrumentId)` → `{ bid, ask }`
- `placeOptionOrder({ instrumentId, side, price, quantity, strategyKey? })`
- `fetchOptionStrategies()`
- `isOptionBuyOrderExecuted(orderInfo)`

متدهای اختیاری:

- `createOptionStrategy(...)`
- `getOptionPositionValue(...)`
- `getOptionAutoValues(instrumentIdA, instrumentIdB)`
- `refreshOptionMarketData()`
- `getOptionSymbolsEmptyMessage()`
- `isOptionPageVisible()`

### پارسیان و خبرگان

- auth از `localStorage["auth"]` خوانده می‌شود.
- endpointهای search/order/strategy روی API مشابه استفاده می‌شوند.
- نماد و quote اختیار از DOM آیتم‌های watchlist/favorites خوانده می‌شود.
- ساخت استراتژی اولیه با `BullCallSpread` در endpoint ساخت strategy انجام می‌شود.
- بررسی انجام‌شدن خرید فعلاً فقط یک ثانیه صبر می‌کند و همیشه `true` برمی‌گرداند.

### گنجینه سپهر / Ephoenix

- session از `x-sessionId` یا `LoginData.sessionId` خوانده می‌شود.
- زنجیره اختیار از endpointهای option API دریافت و حدود 1.5 ثانیه cache می‌شود.
- نماد و quote در حالت دیدبان از DOM خوانده می‌شود و با داده زنجیره تکمیل می‌گردد.
- strategy در این adapter پشتیبانی نمی‌شود (`supportsOptionStrategies: false`).
- ثبت order با `NewOrder` و payload متفاوت از پارسیان/خبرگان انجام می‌شود.
- بررسی انجام‌شدن خرید نیز فعلاً placeholder یک‌ثانیه‌ای است.

## مدل فعلی معامله

UI فقط دو انتخاب دارد: `opt-symbol-a` و `opt-symbol-b`.

### بازکردن موقعیت

شرط بازار:

```text
spread = Ask(A) - Bid(B)
BuyReturn = ((MaxValue / spread) - 1) × 100
شرط فعال‌شدن: BuyReturn > ExpectedReturn
```

در هر execution:

1. خرید A در `Ask(A)`، با تعداد `opt-buy-quantity`.
2. انتظار فعلی برای execution خرید.
3. فروش B در `Bid(B)`، با تعداد `opt-buy-sell-quantity`.
4. یک ثانیه مکث و تکرار تا execution count.

### آفست موقعیت

شرط بازار:

```text
spread = Bid(A) - Ask(B)
OffsetReturn = ((spread / Premium) - 1) × 100
شرط فعال‌شدن: OffsetReturn > ExpectedOffsetReturn
```

در هر execution:

1. خرید B در `Ask(B)`، با تعداد `opt-offset-buy-quantity`.
2. انتظار فعلی برای execution خرید.
3. فروش A در `Bid(A)`، با تعداد `opt-sell-quantity`.

دکمه توقف فقط جلوی مرحله‌های بعدی را می‌گیرد؛ اگر order قبلاً ثبت شده باشد، rollback یا cancel خودکار وجود ندارد.

## polling و state فعلی

- مانیتورینگ quote هر 1000ms اجرا می‌شود.
- refresh نمادها، strategyها و auto values هر 2000ms انجام می‌شود.
- `optionTimer` فقط یک monitoring loop دارد.
- alarm بر اساس تغییر signature شرط، برای Buy و Offset جداگانه اجرا می‌شود.
- preferenceهای UI با prefix `ppt-option-preference:` در localStorage ذخیره می‌شوند.
- وضعیت زوج، execution و order در حافظه صفحه است و persistence ندارد.

## نقاط مهم برای پیاده‌سازی چندزوجی

پیشنهاد می‌شود قابلیت جدید بر پایه مدل `Pair` ساخته شود و منطق فعلی A/B مستقیماً کپی نشود.

مدل پیشنهادی حداقلی:

```js
{
  id: "pair-1",
  name: "زوج اول",
  symbolA: { instrumentId, title },
  symbolB: { instrumentId, title },
  strategyKey: null,
  parameters: {
    maxValue,
    premium,
    expectedReturn,
    expectedOffsetReturn
  },
  quantities: {
    openBuyA,
    openSellB,
    offsetBuyB,
    offsetSellA
  },
  enabled: true
}
```

برای توسعه، این مرزبندی مناسب است:

1. `PairStore`: افزودن/حذف/ویرایش زوج، انتخاب زوج فعال و persistence.
2. `PairMonitor`: یک timer مرکزی، دریافت quote همه instrumentهای یکتا و محاسبه شرط هر زوج.
3. `PairExecutionEngine`: state machine مستقل برای open/offset هر زوج؛ جلوگیری از اجرای هم‌زمان ناخواسته.
4. `PairView`: نمایش لیست زوج‌ها، وضعیت quote/return/order و کنترل‌های هر زوج.
5. adapter contract: در صورت نیاز متدهای batch quote، order status، cancel order و position را اضافه کند.

### نکات طراحی که باید حفظ شوند

- quoteهای مشترک بین زوج‌ها فقط یک بار در هر cycle خوانده شوند.
- هر زوج باید execution lock و stop state مستقل داشته باشد.
- strategy و پارامترهای مالی متعلق به خود زوج‌اند، نه global UI.
- تغییر نماد یا حذف زوج نباید timer یا order زوج‌های دیگر را خراب کند.
- قبل از ارسال leg دوم، execution واقعی leg اول باید تأیید شود.
- خطای یک زوج نباید مانیتورینگ زوج‌های دیگر را متوقف کند.
- instrument ID در هر کارگزاری ممکن است ISIN یا شناسه داخلی باشد؛ Pair نباید به شکل DOM خاص یک broker وابسته شود.

## ریسک‌ها و بدهی‌های فنی فعلی

1. `isOptionBuyOrderExecuted` واقعی نیست؛ در معاملات دو یا چندزوجی این ریسک بسیار جدی‌تر می‌شود.
2. pollingهای مستقل متعدد می‌توانند درخواست‌های تکراری و race condition ایجاد کنند.
3. اگر بین leg اول و دوم قیمت تغییر کند، سفارش دوم با quote جدید ثبت می‌شود اما تضمین atomicity وجود ندارد.
4. cancel order، open-order reconciliation و تشخیص partial fill وجود ندارد.
5. strategy در Ephoenix غیرفعال است و فرضیات strategy پارسیان قابل تعمیم نیست.
6. پاسخ APIها با شکل‌های مختلف normalize می‌شوند، اما contract تست‌شده و test fixture وجود ندارد.
7. اجرای اسکریپت‌ها با injection به صفحه و دسترسی به localStorage، به تغییر DOM یا CSP کارگزاری حساس است.
8. اطلاعات session/auth و endpointهای broker در کد client-side هستند؛ باید از ثبت log حساس خودداری شود.
9. هیچ تست خودکار برای فرمول‌ها، adapterها یا order sequencing در repository دیده نشد.

## اطلاعاتی که برای شروع پیاده‌سازی چندزوجی لازم است

موارد زیر تصمیم‌های محصولی/عملیاتی هستند و از کد فعلی قابل استنتاج قطعی نیستند:

### رفتار زوج‌ها

- حداکثر تعداد زوج هم‌زمان چند است؟
- همه زوج‌ها هم‌زمان monitor شوند یا فقط زوج‌های فعال؟
- اجرای سفارش خودکار باشد یا فقط alarm و دکمه دستی؟
- در صورت hit شدن هم‌زمان چند زوج، اولویت با کدام زوج است؟
- آیا یک instrument می‌تواند در چند زوج استفاده شود؟

### مقدارها و ریسک

- `MaxValue` و `Premium` برای هر زوج دستی‌اند یا باید از broker محاسبه شوند؟
- تعداد legهای هر زوج ثابت و برابر است یا مستقل و قابل partial execution؟
- بعد از partial fill یا failure leg دوم چه رفتاری لازم است: توقف، retry، cancel یا هشدار؟
- execution count برای هر زوج است یا global؟

### داده و کارگزاری

- برای هر کارگزاری endpoint رسمی order status/open orders چیست؟
- تشخیص پرشدن سفارش باید بر اساس order ID، معاملات حساب یا تغییر position انجام شود؟
- برای گنجینه سپهر، آیا quote API باید جایگزین/مکمل DOM دیدبان شود؟
- آیا چندزوج می‌تواند در یک صفحه/یک session کارگزاری اجرا شود؟

### UI و persistence

- زوج‌ها در localStorage ذخیره شوند یا فقط تا refresh صفحه زنده باشند؟
- نمایش به شکل جدول فشرده مناسب است یا کارت جدا برای هر زوج؟
- تنظیمات global مثل alarm interval مشترک باشند یا برای هر زوج جدا؟
- import/export تنظیمات زوج‌ها لازم است؟

## چک‌لیست اعتبارسنجی قبل از merge

- [ ] تست دستی ورود و session برای هر سه broker
- [ ] تست دریافت symbol و quote برای هر broker
- [ ] تست فرمول BuyReturn و OffsetReturn با اعداد ثابت
- [ ] تست توقف بین leg اول و leg دوم
- [ ] تست failure API و partial fill
- [ ] تست اجرای هم‌زمان حداقل دو زوج
- [ ] تست استفاده مشترک یک instrument در دو زوج
- [ ] تست reload صفحه و بازیابی تنظیمات
- [ ] تست عدم ارسال order وقتی شرط در cycle جاری برقرار نیست
- [ ] ثبت نسخه/شاخه/commit مورد استفاده در گزارش تست

## راهنمای ادامه کار برای agent

قبل از تغییر کد:

1. ابتدا این فایل و `README.md` را بخوان.
2. شاخه و commit فعلی را با `git status` و `git log` تأیید کن.
3. تفاوت `main..AddGsBroker` را معماری پایه چندکارگزاری فرض کن.
4. برای چندزوجی، state و execution را از متغیرهای global زوج A/B جدا کن.
5. order واقعی را تا زمانی که endpoint status و رفتار partial fill مشخص نشده، production-safe فرض نکن.
6. پس از هر تغییر، حداقل syntax check و تست دستی broker مربوطه را انجام بده.
