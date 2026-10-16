# 💰 Catalyst free tier mudinjadhu + plan (Notes)

Date: 2026-10-16 (Friday) · branch `post-handover`

---

## 1️⃣ Enna aachu

- 15:55 la supervisor page la: **"You have exhausted the free tier allowance for Datastore - Fetch. Please set up a payment method to continue using this resource."**
- Catalyst free tier = **maasam ku**, **account muzhusukkum** (ella projects um share):

| Velai | Free / maasam |
|---|---|
| Data Store **SELECT (read)** | **10,000** |
| INSERT | 5,000 |
| UPDATE | 1,000 |
| DELETE | 1,000 |

- Kaaranam: oru naal muzhusaa build + test, ovvoru timeline load ~12 reads, supervisor page 1 min auto refresh (adhu remove pannitom).
- Reset: **adutha maasam 1st** (1 Nov), illa payment method add pannina udane.
- ⚠️ Live app um adhe account la irundha adhuvum read panna mudiyaadhu.

## 2️⃣ "Read" na enna (hotel story)

Server (cook) ku memory illa. Ovvoru request um **store room (Data Store)** ku poi eduthuttu varanum. **Oru trip = 1 read.**
Timeline oru thadavai open = ~12 trips (guard, duty, works, messages, names, alerts, breaks, post…).

## 3️⃣ Selavu estimate (800 guards)

| | Naal | Maasam |
|---|---|---|
| Reads | ~4,00,000 | ~1.2 crore |
| Inserts | ~12,000 | ~3,60,000 |
| Approx selavu (list price) | | ~$750–$1,000 |

Oru guard / naal ≈ 500 reads (IN 8 + 20 page loads × 14 + 10 messages × 17 + 30 matha velai).
Reads kammi pannina (cache, pudhu messages mattum, combine) **50–70%** kurayum.

## 4️⃣ Catalyst team ku anuppa message

```
Subject: Free tier exhausted – please add my account to a plan

Hi Madam,

My Catalyst account (Org ID: 60086856508) has used up this month's free
tier for Data Store reads. The console now shows:

  "You have exhausted the free tier allowance for Datastore - Fetch.
   Please set up a payment method to continue using this resource."

We are building a guard duty and handover app for our security team
(project: EscortCardAccess). It is still in the development stage, and
the free tier ran out while we were developing and testing it.

To continue the work, we need more usage than the free tier gives.
Could you please add this account to the suitable plan?

Please let me know if you need any details or approvals from me.

Thank you,
Premkumar R
```
(Live app nikkudhu na: "Our live app on the same account has also stopped." add pannunga.)

Enga: Catalyst console → **? Help → Contact Support**, illa internal Catalyst team.

## 5️⃣ Zoho Store subscribe page ku thirumba vara

- Direct: https://store.zoho.in/html/store/index.html#subscription?serviceId=220000&customId=60086856508
- Illa: console.catalyst.zoho.in → Settings / Billing → Upgrade / Set up payment method
- Adhe company Catalyst account la login la irukkanum.
- 16 Oct la paathadhu: ₹600 + ₹108 tax = **₹708** (Pay step). **Proceed munnaadi:** manager approval, Plan step la enna kidaikkum, recurring ah nu check.

## 6️⃣ Mudivugal

| Kelvi | Mudivu |
|---|---|
| Vera Catalyst account la try? | ❌ Vendaam: 10k reads seekiram mudiyum, ellaa tables thirumba, company data personal account la koodaadhu |
| Ippo enna pannalaam | Message anuppu → badhil wait → indha neram reads kammi panra code (test apram) |
| Code la maathinadhu | Supervisor page **auto refresh remove** (tab ku thirumba vandhaa / 🔄 mattum) |

## 🗣️ Spoken English
- "The free tier is shared across all projects in the account."
- "It is still in the development stage, and the free tier ran out while we were testing."
- "About eight hundred guards will use the app every day."
- "Each time the page opens, the server reads the data again."
- "Could you please add this account to the suitable plan?"
