# SqueekRunner Hamsters — контракт коллекции

Изолированный ERC-721-проект для **Sepolia (chain ID 11155111)**. Коллекция: максимум
**1000 NFT**, бесплатный mint, оплачивается только газ сети. Здесь нет раффла,
проверки игровых очков, SIWE, бэкенда или минта из интерфейса игры: контракт
принимает итоговый allowlist, подготовленный по решению D-0001.

Контракт не развёрнут в публичной сети. Скрипт деплоя запускает только владелец.

## Установка и проверки

Node 22.13+ в ветке 22 или Node 24; проверено с 24.11.1. Все команды — из `contracts/`:

```sh
npm ci
npm run compile
npm test
```

У этой папки собственные package.json, package-lock.json и node_modules. Установка
контрактов не нужна для игры и не меняет корневые зависимости. Контрактные тесты
названы `test/*.js`, чтобы корневой Vitest не подхватывал их как `*.test.*`.

Используется разрешённый брифом Hardhat 2 + ethers: Hardhat 2.29.1, ethers 6.17.0,
OpenZeppelin Contracts 5.6.1, StandardMerkleTree 1.0.8, solc-js **0.8.28**.
Solidity pragma `^0.8.24`; компиляция закреплена на 0.8.28, optimizer 200 runs,
EVM target Cancun. Конфигурация подменяет стандартную загрузку компилятора на
локальный `solc/soljson.js` из npm и компилирует в текущем процессе: отдельный
Solidity-бинарник не скачивается, Foundry и глобальные установки не нужны.

В ограниченной Windows-среде npm dependency scripts используют inherited stdio
через локальный `.npmrc`. Опциональная native-сборка `keccak` может напечатать
`spawn EPERM`; пакет допускает JS fallback, поэтому успешность определяется exit
code npm ci и тестами, а не отсутствием этой диагностики. Тесты проверены с этим
fallback. Нативный локальный EVM Hardhat поставляется как зависимость npm.

`scripts/hardhat.cjs` хранит служебные данные Hardhat в игнорируемой
`.hardhat-local/` и отключает его telemetry. Настройки каталогов меняются только
внутри этого Node-процесса; профиль пользователя и родительская оболочка не меняются.
Прокси и RPC для тестов не нужны: Hardhat использует локальную сеть chain ID 31337.

## Контракт и параметры

Файл: `src/SqueekRunnerHamsters.sol`. Конструктор:

```solidity
constructor(string name_, string symbol_, address initialOwner, string initialBaseURI)
```

Рабочие name/symbol: `SqueekRunner Hamsters` / `SQRH`. Начальный владелец задаётся
явно; это может быть EOA или совместимый multisig. Нулевой адрес запрещён.
Начальная фаза — `Closed`, Merkle root не установлен, ни одного токена не выпущено.
ID идут последовательно от **1 до 1000**. Burn и изменение лимитов не предусмотрены.

| Параметр / счётчик | Значение или смысл |
| --- | --- |
| MAX_SUPPLY | 1000, неизменяемая константа |
| RESERVE | 100, неизменяемая константа |
| ALLOWLIST_SUPPLY | 900 = MAX_SUPPLY − RESERVE |
| totalSupply | Суммарное число выпущенных NFT, burn отсутствует |
| allowlistMinted | Выпущено через claim за всё время, максимум 900 |
| reserveMinted | Выпущено через ownerMint за всё время, максимум 100 |
| claimed(address) | Суммарное число claims адреса за всё время, не его текущий баланс |

Распределение **700 раффл / 200 Twitter / 100 команда и трежери** — правило проекта.
Контракт строго разделяет **900 allowlist / 100 reserve**. Он не определяет, пришёл
ли адрес из раффла или Twitter: это проверяется организатором при подготовке списка.
Неиспользованный резерв не переходит в allowlist, и наоборот. Один адрес может
получить резерв и иметь отдельный allowlist allowance.

### Allowlist и фазы

```solidity
setMerkleRoot(bytes32 newRoot)               // onlyOwner, ненулевой root
setPhase(Phase newPhase)                    // onlyOwner: 0 Closed, 1 Allowlist
claim(uint256 allowance, uint256 qty, bytes32[] proof)
ownerMint(address to, uint256 qty)          // onlyOwner, в любой фазе
```

Открытие Allowlist возможно только после установки root. Владелец может закрыть
и вновь открыть mint. Нулевое qty отклоняется. Claim минтит только `msg.sender`:
чужой proof нельзя использовать для получения NFT на свой адрес.

Лист дерева точно соответствует OpenZeppelin StandardMerkleTree:

```solidity
keccak256(bytes.concat(keccak256(abi.encode(account, allowance))))
```

ABI-типы — `address,uint256`, листья двойного хеширования, пары сортируются
стандартной библиотекой. Это не `abi.encodePacked`, не простой одинарный хеш
и не личная подпись кошелька. Proof публичен; авторизация обеспечивается root и
привязкой листа к `msg.sender`.

**Allowance — накопленное право адреса за всю жизнь контракта.** Корень можно менять,
но `claimed` никогда не обнуляется. Если адрес имел allowance 1 и уже получил 1 NFT,
то новый лист с allowance 2 разрешает ещё **1**, а не 2. Если новое allowance ниже
уже использованного, новые claims отклоняются. Передача NFT другому владельцу
не возвращает право на claim.

Root меняется немедленно, в том числе при открытой фазе; старые proofs перестают
работать. Изменения публикуются событием `MerkleRootUpdated(previousRoot,newRoot)`.
Чтобы меньше мешать ожидающим транзакциям, владелец может закрыть фазу, опубликовать
новый список/root/proofs и открыть фазу снова. Это операционная рекомендация,
а не дополнительное ограничение контракта.

## Сборка Merkle root и proofs

Вход — UTF-8 CSV с заголовком `address,allowance` либо JSON-массив объектов:

```json
[
  { "address": "0x0000000000000000000000000000000000000001", "allowance": 2 },
  { "address": "0x0000000000000000000000000000000000000002", "allowance": 1 }
]
```

Эти адреса — **учебные примеры, не список победителей**. Не публикуйте их root для
реальной коллекции. Примеры обеих форм лежат в `examples/`.

```sh
npm run merkle -- examples/allowlist.csv generated/example-v1.json
# Эквивалентный JSON-вход:
npm run merkle -- examples/allowlist.json generated/example-json-v1.json
```

Скрипт проверяет адреса/checksum, запрещает zero address и дубликаты (включая
разный регистр), разрешает целые allowance 1–900, не больше 900 адресов и сумму
allowance ≤900. JSON принимает число или десятичную строку; CSV — простые или
заключённые в кавычки address/allowance без дополнительных столбцов. Не является
универсальным CSV-парсером: поля адресов и чисел не содержат запятых/переносов.
Адреса нормализуются и сортируются, поэтому перестановка строк не меняет результат.

Выход содержит `root`, `totalAllowance`, `leafEncoding`, `entries` с address,
allowance и proof для каждого адреса, а также `tree` — dump для
`StandardMerkleTree.load`. Никаких приватных ключей в этом файле нет. Существующий
output-файл не перезаписывается: используйте новое имя версии. Каталог generated
игнорируется git; владелец отдельно публикует утверждённые данные и proofs.

Для последовательного прихода двух списков готовьте **накопленный объединённый
список раффла и Twitter**, учитывая пересечения адресов. Скрипт не складывает
дубликаты автоматически: организатор должен явно назначить суммарный allowance.
Он не читает on-chain claimed и не сверяет историю старых root. Удаление уже
минтивших адресов из нового списка не освобождает глобальный лимит: иначе даже
новый список с суммой ≤900 может обещать больше оставшегося mint. Контракт всё равно
не выпустит больше 900 allowlist NFT. Бюджеты 700/200 проверяйте отдельно до публикации.

Пример вызова уже развёрнутого контракта через ethers (ABI — из artifact):

```js
const entry = proofs.entries.find(x => x.address.toLowerCase() === signer.address.toLowerCase());
await (await collection.connect(signer).claim(entry.allowance, 1, entry.proof)).wait();
```

Параметр `value` не передаётся. Allowance берётся из опубликованного листа; qty —
желаемая часть остатка. Для больших разрешений отправляйте небольшие партии
(например, 20–50 NFT), предварительно оценив газ: safeMint вызывает получателя
для каждого токена, поэтому большой batch может не поместиться в лимит газа.

## Метаданные и владение

`tokenURI(id)` возвращает `baseURI + decimal(id) + ".json"`. Например,
`ipfs://CID/` → `ipfs://CID/1.json`. Slash контракт автоматически не добавляет.
Для несуществующего id — стандартная ошибка ERC721NonexistentToken. Если базовый
URI при деплое пуст, существующие токены временно возвращают пустую строку.

- `setBaseURI(string)` — только owner; новое значение должно быть непустым.
- `freezeMetadata()` — только owner, необратимо запрещает смену baseURI; пустой
  URI замораживать нельзя. Повторная заморозка отклоняется.
- Заморозка относится к **строке URI**, а не к содержимому HTTP-сервера. Для
  неизменяемого содержания нужны content-addressed метаданные и корректный pinning.
- До freeze owner может менять метаданные всей коллекции. Это заготовка для
  будущих изменений; динамический генератор метаданных в эту задачу не входит.
- `transferOwnership(newOwner)` задаёт pendingOwner; только он может вызвать
  `acceptOwnership()`. Старый owner сохраняет права до принятия, затем теряет их.
- Унаследованный `renounceOwnership()` необратимо отказывается от управления.
  Не вызывайте его до завершения mint/настройки metadata: можно навсегда оставить
  закрытый mint или потерять неиспользованный reserve. Это не часть штатного runbook.

События: стандартные Transfer/Approval/Ownership*, а также MerkleRootUpdated,
PhaseUpdated, Claimed, ReserveMinted, BaseURIUpdated и MetadataFrozen.
Нарушения бизнес-правил дают custom errors (MintClosed, InvalidQuantity,
InvalidProof, AllowanceExceeded, AllowlistSupplyExceeded, ReserveSupplyExceeded,
MaxSupplyExceeded, InvalidMerkleRoot, MetadataIsFrozen, EmptyBaseURI) либо ошибки OZ.

## Безопасность и выбранные ограничения

Оба пути mint используют **ReentrancyGuard + checks/effects/interactions**:
все лимиты и счётчики, включая полный диапазон id, резервируются перед первым
`_safeMint`. При отказе ERC721Receiver весь batch и учёт откатываются.
`_safeMint` выбран вместо `_mint`, чтобы не запирать NFT в контракте, который
не умеет их принимать. Тесты включают злонамеренный повторный вход в claim и
ownerMint, отказ получателя и отсутствие интерфейса ERC721Receiver.

Claim и ownerMint не payable. receive/fallback/withdraw отсутствуют. Прямой перевод
ETH отклоняется; принудительно присланный EVM-механизмами ETH вернуть через этот
контракт нельзя. Роялти отсутствуют: ERC-2981 не реализован, контракт не задаёт
получателя/ставку и не собирает комиссии. Это минимальная бесплатная коллекция;
правила комиссий внешних маркетплейсов контракт не контролирует.

Прокси, апгрейд, oracle calls, randomness, on-chain raffle и проверка игрового
результата отсутствуют. Администратор доверенный: он может заменить root, закрыть
mint, направить reserve и менять URI до freeze. Коммит root не подтверждает
справедливость внешнего розыгрыша. Тесты не заменяют независимый аудит Solidity.

Hardhat 2 выбран для воспроизводимого in-process solc-js workflow в этой среде и
разрешён брифом, но ветка находится на пути к EOL. `npm audit` сообщает уязвимости
в транзитивных инструментах (включая старые HTTP/архивные зависимости Hardhat и
uuid в Merkle-инструментах); автоматический non-breaking audit fix их не устранил.
Они не попадают в Solidity bytecode или корневую игру. Не используйте этот
toolchain как публичный сервис и не обрабатывайте им недоверенные архивы/тесты.
Перед эксплуатацией за пределами локального Sepolia-процесса обновите и повторно
проверьте инструментальную цепочку. Точный audit snapshot приведён в отчёте T009.

## Деплой: только действие владельца

1. Проверить окончательный commit, прочитать контракт, прогнать `npm ci`,
   `npm run compile`, `npm test`. Сохранить версию compiler/settings и build-info.
2. Подготовить Sepolia RPC, кошелёк с тестовым ETH для газа и адрес начального
   владельца NFT_OWNER. Убедиться, что этот адрес управляем и может выполнять
   owner-вызовы; для multisig проверить поддержку Sepolia.
3. Скопировать `.env.example` в `.env` локально (PowerShell:
   `Copy-Item .env.example .env`) и заполнить в редакторе. Не передавать ключ в
   аргументах команд, не публиковать .env и не отправлять его в чат.

| Env | Назначение |
| --- | --- |
| SEPOLIA_RPC_URL | Обязательный HTTP(S) RPC; не логируется |
| DEPLOYER_PRIVATE_KEY | Обязательный 0x-prefixed private key; не логируется |
| NFT_OWNER | Обязательный явный nonzero initialOwner |
| NFT_NAME / NFT_SYMBOL | Опциональны; defaults SqueekRunner Hamsters / SQRH |
| NFT_BASE_URI | Опционален; пустой или prefix с завершающим `/` |

4. **Владелец**, после этих проверок, запускает:

```sh
npm run deploy:sepolia
```

Эта команда действительно отправляет deployment transaction. Она читает .env через
Node; env родительского процесса имеет приоритет. Скрипт не имеет fallback RPC,
ключа или default owner. До подписи проверяется `eth_chainId = 11155111`; mainnet
и local chain отклоняются. Используется только artifact SqueekRunnerHamsters,
тестовые ReceiverHarness/NonReceiver никогда не разворачиваются этим скриптом.
Проект не конфигурирует удалённую сеть Hardhat, поэтому `npm test` и compile
не могут сами отправить Sepolia-транзакции.

После отправки печатается tx hash, после подтверждения — адрес контракта и
публичные параметры. Сохраните их. При ошибке после вывода tx hash проверьте
статус в explorer прежде чем повторять команду, чтобы не развернуть дубль.
Raw RPC errors намеренно не печатаются: они могут содержать API-токен из URL.

5. Проверить receipt и on-chain owner/name/symbol/phase/supply. Верифицировать
   исходники в Sepolia explorer с теми же compiler 0.8.28, optimizer 200 и Cancun;
   сервис верификации и его API-ключ в пакет не добавлены.
6. Подготовить и проверить реальный объединённый список 700+200, сгенерировать
   новую версию root/proofs. Owner вызывает setMerkleRoot, публикует список/proofs,
   затем setPhase(1). Контракт после deployment всегда Closed.
7. Owner распределяет reserve через ownerMint, не больше 100 суммарно. Завершив
   подготовку контента, задаёт окончательный URI и при необходимости freezeMetadata.
   Закрытие mint — setPhase(0). Передача администрирования — два шага Ownable2Step.

В этом репозитории нет публичного deployment-адреса: ни одна такая транзакция
исполнителем T009 не отправлялась.

## Первичные источники

- [OpenZeppelin ERC-721](https://docs.openzeppelin.com/contracts/5.x/api/token/erc721)
- [OpenZeppelin Ownable2Step](https://docs.openzeppelin.com/contracts/5.x/api/access)
- [StandardMerkleTree и double-hashed leaves](https://github.com/OpenZeppelin/merkle-tree)
- [Hardhat: локальный Solidity compiler](https://v2.hardhat.org/hardhat-runner/docs/other-guides/using-custom-solc)
