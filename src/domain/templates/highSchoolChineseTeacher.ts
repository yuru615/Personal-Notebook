import type {
  BlockRecord,
  BoardRecord,
  DataTableRecord,
  MindmapRecord,
  PageRecord,
  SyncedBlockGroupRecord,
} from '../types'

export interface TeacherTemplateAsset {
  id: string
  name: string
  mimeType: string
  relativePath: string
  bytes: Uint8Array
}

export interface TeacherTemplateBundle {
  rootPageId: string
  pages: PageRecord[]
  boards: BoardRecord[]
  dataTables: DataTableRecord[]
  mindmaps: MindmapRecord[]
  syncedBlockGroups: SyncedBlockGroupRecord[]
  assets: TeacherTemplateAsset[]
}

export const TEMPLATE_NOW = '2026-07-16T00:00:00.000Z'

const id = (kind: string, name: string) => `teacher-template-${kind}-${name}`
const blockId = (pageSlug: string, index: number) => id('block', `${pageSlug}-${index}`)

function heading_1(pageSlug: string, index: number, text: string): BlockRecord {
  return { id: blockId(pageSlug, index), type: 'heading_1', text }
}

function heading_2(pageSlug: string, index: number, text: string): BlockRecord {
  return { id: blockId(pageSlug, index), type: 'heading_2', text }
}

function paragraph(pageSlug: string, index: number, text: string): BlockRecord {
  return { id: blockId(pageSlug, index), type: 'paragraph', text }
}

function todo(pageSlug: string, index: number, text: string): BlockRecord {
  return { id: blockId(pageSlug, index), type: 'todo', text, checked: false }
}

function bulleted_list(pageSlug: string, index: number, items: string[]): BlockRecord {
  return { id: blockId(pageSlug, index), type: 'bulleted_list', items }
}

function numbered_list(pageSlug: string, index: number, items: string[]): BlockRecord {
  return { id: blockId(pageSlug, index), type: 'numbered_list', items }
}

function table(pageSlug: string, index: number, rows: string[][]): BlockRecord {
  return {
    id: blockId(pageSlug, index),
    type: 'table',
    rows,
    hasHeaderRow: true,
    fitToContent: true,
  }
}

function code(pageSlug: string, index: number, text: string): BlockRecord {
  return { id: blockId(pageSlug, index), type: 'code', language: 'text', text }
}

function child_page(pageSlug: string, index: number, pageId: string): BlockRecord {
  return { id: blockId(pageSlug, index), type: 'child_page', pageId }
}

function page(
  name: string,
  parentId: string | null,
  title: string,
  icon: string,
  blocks: BlockRecord[],
  cover: string | null = null,
): PageRecord {
  return {
    id: id('page', name),
    parentId,
    title,
    icon,
    cover,
    properties: {},
    isFullWidth: false,
    isSmallText: false,
    fontFamily: 'default',
    showOutline: true,
    showProperties: false,
    blocks,
    createdAt: TEMPLATE_NOW,
    updatedAt: TEMPLATE_NOW,
  }
}

interface LessonSpec {
  slug: string
  positioning: string
  learnerAnalysis: string
  objectives: string[]
  keyPoints: string[]
  preparation: string[]
  flow: string[][]
  questions: string[]
  board: string
  homework: string[]
  reflection: string[]
}

function createLessonBlocks(spec: LessonSpec): BlockRecord[] {
  const slug = spec.slug

  return [
    heading_2(slug, 0, '教材定位'),
    paragraph(slug, 1, spec.positioning),
    heading_2(slug, 2, '学情分析'),
    paragraph(slug, 3, spec.learnerAnalysis),
    heading_2(slug, 4, '学习目标'),
    numbered_list(slug, 5, spec.objectives),
    heading_2(slug, 6, '教学重点与难点'),
    bulleted_list(slug, 7, spec.keyPoints),
    heading_2(slug, 8, '课前准备'),
    bulleted_list(slug, 9, spec.preparation),
    heading_2(slug, 10, '教学流程'),
    table(slug, 11, [
      ['课时与环节', '建议用时', '教师行动', '学习活动', '形成性证据'],
      ...spec.flow,
    ]),
    heading_2(slug, 12, '核心问题链'),
    numbered_list(slug, 13, spec.questions),
    heading_2(slug, 14, '板书设计'),
    code(slug, 15, spec.board),
    heading_2(slug, 16, '作业设计'),
    bulleted_list(slug, 17, spec.homework),
    heading_2(slug, 18, '课后复盘'),
    bulleted_list(slug, 19, spec.reflection),
  ]
}

function createKnowledgeCardBlocks(
  slug: string,
  definition: string,
  method: string,
  example: string,
  confusion: string,
  exercise: string,
): BlockRecord[] {
  return [
    heading_2(slug, 0, '定义'),
    paragraph(slug, 1, definition),
    heading_2(slug, 2, '识别方法'),
    numbered_list(slug, 3, [method]),
    heading_2(slug, 4, '课内示例说明（转述）'),
    paragraph(slug, 5, example),
    heading_2(slug, 6, '易混点'),
    paragraph(slug, 7, confusion),
    heading_2(slug, 8, '迁移练习'),
    paragraph(slug, 9, exercise),
  ]
}

const pageIds = {
  root: id('page', 'root'),
  guide: id('page', 'guide'),
  dashboard: id('page', 'dashboard'),
  planning: id('page', 'planning'),
  semesterMap: id('page', 'semester-map'),
  unit: id('page', 'unit-7'),
  unitOverview: id('page', 'unit-overview'),
  lessonAutumn: id('page', 'lesson-autumn'),
  lessonLotus: id('page', 'lesson-lotus'),
  lessonDitan: id('page', 'lesson-ditan'),
  lessonChibi: id('page', 'lesson-chibi'),
  lessonTaishan: id('page', 'lesson-taishan'),
  unitTasks: id('page', 'unit-tasks'),
  execution: id('page', 'execution'),
  preparationTasks: id('page', 'preparation-tasks'),
  calendar: id('page', 'calendar'),
  classroomBoard: id('page', 'classroom-board'),
  resources: id('page', 'resources'),
  resourceLibrary: id('page', 'resource-library'),
  knowledgeCards: id('page', 'knowledge-cards'),
  cardSceneEmotion: id('page', 'card-scene-emotion'),
  cardSynaesthesia: id('page', 'card-synaesthesia'),
  cardFigures: id('page', 'card-figures'),
  cardEr: id('page', 'card-er'),
  cardMovingView: id('page', 'card-moving-view'),
  cardEmotionalThread: id('page', 'card-emotional-thread'),
  writingLibrary: id('page', 'writing-library'),
  unitMindmap: id('page', 'unit-mindmap'),
  homework: id('page', 'homework'),
  homeworkDesign: id('page', 'homework-design'),
  commonIssues: id('page', 'common-issues'),
  classObservation: id('page', 'class-observation'),
  reflection: id('page', 'reflection'),
  afterClassReflection: id('page', 'after-class-reflection'),
  unitReflection: id('page', 'unit-reflection'),
  researchInbox: id('page', 'research-inbox'),
}

const lessonSpecs: Array<{ title: string; icon: string; spec: LessonSpec }> = [
  {
    title: '14-1《故都的秋》',
    icon: '🍂',
    spec: {
      slug: 'lesson-autumn',
      positioning: '以景物选择和色彩语言为抓手，理解作者如何把北国秋景组织成“清、静、悲凉”的审美体验，并为单元比较阅读建立方法。',
      learnerAnalysis: '高一（3）班能够概括景物特点，但容易把情感基调停留在形容词层面；高一（6）班需要借助景物清单和色彩词标注，把判断落到文本证据。',
      objectives: [
        '梳理庭院、秋槐、秋蝉、秋雨等景物，说明选择这些景物的表达作用。',
        '从色彩、声音、节奏和观察角度分析“清、静、悲凉”的形成过程。',
        '比较南北秋景的写法与感受，形成有证据的比较阅读结论。',
      ],
      keyPoints: [
        '重点：景物选择、色彩语言与情感基调之间的关系。',
        '难点：区分作者的审美感受与简单的消沉判断，解释悲凉中的眷恋。',
      ],
      preparation: [
        '圈画景物名词、色彩词和声音词，按视觉、听觉与触觉分类。',
        '用一句话分别概括自己熟悉的秋景与文中北国秋景。',
      ],
      flow: [
        ['导入与预判', '5 分钟', '呈现两组不同地域秋景描述，追问选择差异', '写下第一印象并说明依据', '景物—感受配对'],
        ['整体感知', '8 分钟', '组织朗读并汇总景物清单', '标注色彩、声音和动作词', '分类标注'],
        ['细读研讨', '15 分钟', '聚焦庭院、秋槐与秋雨片段的观察角度', '小组解释“清、静、悲凉”如何生成', '证据卡片'],
        ['南北比较', '10 分钟', '提供比较维度：景物、节奏、情感浓度', '完成对照表并口头陈述', '比较结论'],
        ['回扣单元', '7 分钟', '回到自然景物与生命感受的核心问题', '写 60 字课堂小结', '退出条'],
      ],
      questions: [
        '作者为何偏爱普通、衰败而安静的景物，而不是选择热烈壮阔的秋景？',
        '色彩语言和声音描写怎样共同营造“清、静、悲凉”？',
        '南北秋景比较是客观地理说明，还是为了突出特定审美感受？',
        '悲凉是否等于消沉？请用景物选择与叙述语气作答。',
      ],
      board: '故都的秋\n├─ 景物选择：庭院／秋槐／秋蝉／秋雨\n├─ 语言层次：色彩淡 → 声音疏 → 节奏缓\n├─ 情感基调：清／静／悲凉\n└─ 比较阅读：北国之秋 ↔ 南国之秋\n结论：以景显情，悲凉中有眷恋',
      homework: [
        '基础：整理四处景物的特征、感官角度与情感作用。',
        '提升：完成 200 字南北秋景比较，至少引用三处文本信息。',
        '迁移：观察一种身边秋景，用色彩和声音写 120 字片段。',
      ],
      reflection: [
        '学生能否把“清、静、悲凉”分别对应到具体语言证据？',
        '南北比较是否帮助理解作者的选择，还是挤占了细读时间？',
        '下一次应保留哪一个追问，删减哪一个环节？',
      ],
    },
  },
  {
    title: '14-2《荷塘月色》',
    icon: '🌙',
    spec: {
      slug: 'lesson-lotus',
      positioning: '作为两课时示范课，通过朗读设计、景物层次、比喻拟人与通感、情感移动和微写作，完整展示散文细读与迁移表达。',
      learnerAnalysis: '高一（3）班善于感受画面但修辞分析容易停在术语辨认；高一（6）班对行文结构和情感变化把握较弱，需要用路线图和朗读重音建立整体理解。',
      objectives: [
        '通过朗读设计梳理行踪、景物层次和段落节奏。',
        '结合比喻、拟人、叠词与通感，说明语言如何建构月下荷塘的感受。',
        '追踪“不宁静—暂得宁静—回到现实”的情感移动，并辨析其复杂性。',
        '把多感官描写方法迁移到一段有情感线索的微写作中。',
      ],
      keyPoints: [
        '重点：朗读与景物层次相互印证，修辞判断落到表达效果。',
        '难点：通感的跨感官转换，以及景物之美与内心波动并存的关系。',
      ],
      preparation: [
        '第一课时前：标出行踪词、景物层次和适合停顿的句群。',
        '第二课时前：任选一处修辞，写出本体、表达方式与具体感受。',
      ],
      flow: [
        ['第一课时·情境导入', '5 分钟', '以“独处时如何观察熟悉景物”设问', '写下观察对象与当时心情', '情境便签'],
        ['第一课时·朗读设计', '12 分钟', '示范停连、重音和语速，组织分层朗读', '标注行踪、停顿与语气变化', '朗读标记'],
        ['第一课时·结构梳理', '10 分钟', '引导绘制出门、荷塘、回家的行踪线', '用段落关键词完成路线图', '行文路线图'],
        ['第一课时·景物层次', '18 分钟', '追问视线如何从荷叶、荷花转向月光与远景', '按近远、上下、动静整理画面', '景物层次表'],
        ['第二课时·语言赏析', '15 分钟', '比较一般表述与文本表达的感受差异', '解释比喻、拟人、叠词的具体作用', '赏析句卡'],
        ['第二课时·通感探究', '10 分钟', '拆分嗅觉与听觉之间的转换逻辑', '用自己的话解释跨感官联想', '通感解释'],
        ['第二课时·情感移动', '10 分钟', '连接行踪、景色与心境，提示解释边界', '完成情感曲线并标注证据', '情感曲线'],
        ['第二课时·微写作', '10 分钟', '给出多感官与情感线索要求', '写 120 字校园夜景并互评', '微写作初稿'],
      ],
      questions: [
        '朗读设计中的停连、重音和语速应如何表现景物层次？',
        '视线在月下荷塘中怎样移动，画面为何显得有层次而不杂乱？',
        '比喻、拟人和通感分别改变了读者的哪一种感受？',
        '短暂的宁静是否真正消解了“不宁静”？情感变化由哪些细节支持？',
        '微写作怎样避免只堆叠修辞，而让景物服务于情感线索？',
      ],
      board: '《荷塘月色》两课时投屏布局\n左：行踪线  出门 → 荷塘 → 回家\n中：景物层  荷叶／荷花 → 月光 → 树影与远景\n右：语言层  比喻／拟人／叠词／通感\n下：情感线  不宁静 → 暂得宁静 → 回到现实\n出口：用一种跨感官联想完成微写作',
      homework: [
        '第一课时：完善朗读设计，在三处句群标出停连、重音和理由。',
        '第二课时基础：选择一处比喻、拟人或通感，完成“形式—感受—情感”分析。',
        '第二课时提升：修改课堂微写作，使景物层次与情感变化彼此照应。',
      ],
      reflection: [
        '两课时的任务递进是否清晰，第一课时的结构学习是否支撑第二课时细读？',
        '学生能否用跨感官关系解释通感，而不是只记术语？',
        '微写作互评中最常见的问题是什么，下次应提供怎样的支架？',
      ],
    },
  },
  {
    title: '15《我与地坛（节选）》',
    icon: '🌳',
    spec: {
      slug: 'lesson-ditan',
      positioning: '以地坛景物、生命体验和母亲形象为三条互相照亮的线索，训练学生从叙述、描写与议论中提取文本证据。',
      learnerAnalysis: '高一（3）班容易被主题感染却忽略论证过程；高一（6）班能够复述事件，但需要把母亲形象的判断落实到动作、等待和叙述视角。',
      objectives: [
        '概括地坛景物的生命状态，解释它对“我”的精神启示。',
        '从行动、心理和叙述视角分析母亲形象，形成证据链。',
        '梳理从困顿到重新理解生命的体验过程，避免空泛主题概括。',
      ],
      keyPoints: [
        '重点：景物描写与生命体验之间的内在联系。',
        '难点：通过有限叙述和迟到的理解把握母亲形象。',
      ],
      preparation: [
        '把地坛景物按“衰败痕迹”和“持续生长”两类整理。',
        '圈画与母亲有关的动作、等待和“我”的后知后觉。',
      ],
      flow: [
        ['进入文本', '5 分钟', '提出“环境何以改变人的观看”', '写下初步判断', '问题预答'],
        ['地坛细读', '15 分钟', '组织两类景物证据归纳', '解释衰败与生机并存的意义', '景物证据表'],
        ['生命体验', '10 分钟', '追踪“我”的思考转折', '绘制体验变化链', '转折链'],
        ['母亲形象', '15 分钟', '引导从行动、心理与叙述距离分析', '组合三条文本证据形成判断', '人物证据链'],
        ['迁移总结', '5 分钟', '回扣自然景物表达生命感受的单元问题', '完成 80 字解释', '退出条'],
      ],
      questions: [
        '地坛景物为何同时保留衰败痕迹与旺盛生命，它改变了“我”的什么认识？',
        '作者怎样从具体观察走向生命思考，中间有哪些文本证据？',
        '母亲很少直接表达自己，读者为何仍能感到她的复杂情感？',
        '“后来才理解”的叙述位置怎样增强人物形象的力量？',
      ],
      board: '地坛景物：衰败痕迹 × 持续生长\n          ↓\n生命体验：困顿 → 凝视 → 思考 → 重新出发\n          ↕\n母亲形象：行动／等待／理解的迟到\n证据路径：景物词句 + 事件细节 + 叙述视角',
      homework: [
        '基础：从地坛景物和母亲形象中各选两条证据，写出解释。',
        '提升：以“迟到的理解”为中心完成 250 字人物赏析。',
        '迁移：记录一处曾改变自己认识的环境，说明变化过程。',
      ],
      reflection: [
        '课堂讨论是否始终要求文本证据，还是滑向了泛泛的人生感想？',
        '母亲形象的分析是否兼顾行动细节与叙述视角？',
        '哪一种证据整理工具最能帮助两个班形成完整回答？',
      ],
    },
  },
  {
    title: '16-1《赤壁赋》',
    icon: '⛵',
    spec: {
      slug: 'lesson-chibi',
      positioning: '在落实重点文言词句的基础上，以主客问答、乐—悲—达的情感结构和水月意象理解文章的哲思表达。',
      learnerAnalysis: '高一（3）班能够借助注释疏通大意，但容易割裂文言知识与篇章结构；高一（6）班对虚词和特殊句式较敏感，需要用主客立场对照把语言落实到思想推进。',
      objectives: [
        '积累重点实词、虚词“而”和典型句式，准确疏通关键语意。',
        '梳理主客问答，解释乐—悲—达的情感转折及其逻辑。',
        '比较水月意象在不同段落中的含义，理解变与不变的思考。',
      ],
      keyPoints: [
        '重点：文言词句、主客问答和情感结构相互支撑。',
        '难点：用水月意象解释“变”与“不变”，避免把“达”简化为情绪乐观。',
      ],
      preparation: [
        '借助注释完成重点词句疏通，并给虚词“而”标注前后关系。',
        '分别概括主人与客人的核心观点，找出水月意象出现的位置。',
      ],
      flow: [
        ['诵读正音', '8 分钟', '检查节奏、语气和重点词句', '分角色朗读并校正', '朗读标记'],
        ['文言落实', '12 分钟', '归纳实词、虚词与句式', '小组互译并说明“而”的关系', '词句清单'],
        ['主客问答', '12 分钟', '组织观点与依据对照', '完成“主—客”论点表', '观点对照表'],
        ['情感结构', '10 分钟', '追踪乐—悲—达的触发点', '用箭头解释转折逻辑', '情感结构图'],
        ['水月意象', '8 分钟', '比较水与月在两种视角中的意义', '回答变与不变如何统一', '意象解释'],
      ],
      questions: [
        '关键虚词和句式怎样影响主客两种声音的语气与逻辑？',
        '由乐转悲的触发点是什么，客人的悲从何而来？',
        '主人如何借水月意象回应客人的困惑？',
        '“达”是回避现实，还是改变观看有限生命的方式？',
      ],
      board: '赤壁夜游\n文言基础：实词／虚词“而”／句式\n主客问答：\n  客——有限、易逝 → 悲\n  主——变与不变 → 达\n情感线：乐 → 悲 → 达\n核心意象：水／月（流动与恒常）',
      homework: [
        '基础：整理六处重点文言词句，标出虚词“而”的关系。',
        '提升：用主客问答结构解释乐—悲—达，不少于 250 字。',
        '比较：选择另一篇写水或月的作品，比较意象承担的思想功能。',
      ],
      reflection: [
        '文言知识检查是否真正服务于主客问答的理解？',
        '学生能否用水月意象说清“变与不变”，而非复述结论？',
        '分角色朗读对情感结构的帮助是否可观察？',
      ],
    },
  },
  {
    title: '16-2《登泰山记》',
    icon: '🌄',
    spec: {
      slug: 'lesson-taishan',
      positioning: '以登山路线为骨架，梳理时间与空间层次，细读日出描写，理解移步换景如何把艰难登临转化为有秩序的审美经验。',
      learnerAnalysis: '高一（3）班能够提取地点词但容易忽略时间推进；高一（6）班对日出画面有直观感受，需要用观察位置、色彩和动态证据说明层次。',
      objectives: [
        '依据地点和方位词复原登山路线，说明游踪的组织作用。',
        '结合时间、观察位置与景物变化，梳理文章的时空层次。',
        '分析日出描写的色彩、动态和远近关系，概括其表达效果。',
      ],
      keyPoints: [
        '重点：登山路线与移步换景，日出描写的层次。',
        '难点：把地理说明、时间推进和审美体验整合为一条阅读线索。',
      ],
      preparation: [
        '圈出地点、方位和时间词，尝试画出登山路线。',
        '把日出过程拆成三个画面，为每个画面拟一个小标题。',
      ],
      flow: [
        ['路线复原', '12 分钟', '检查地点与方位词，示范地图化阅读', '合作绘制登山路线', '路线图'],
        ['时空分层', '10 分钟', '连接登临、夜宿、待日出等时间节点', '为段落标注时空坐标', '时空表'],
        ['日出细读', '15 分钟', '追问色彩、动态、远近和观察顺序', '排列画面并解释层次', '日出分镜'],
        ['写法归纳', '8 分钟', '比较定点观察与移步换景', '概括路线对体验的作用', '方法卡'],
        ['单元回扣', '5 分钟', '联系自然景物与生命感受', '写下登临体验的价值', '退出条'],
      ],
      questions: [
        '地点和方位词怎样帮助读者复原登山路线？',
        '时间推进与空间移动如何共同构成文章层次？',
        '日出描写先写什么、后写什么，色彩和动态怎样变化？',
        '艰难路线是否只是事实记录，它怎样影响最后的审美感受？',
      ],
      board: '登泰山记\n路线：山麓 → 登山 → 山顶\n时间：傍晚 → 夜宿 → 黎明\n观察：近景 ↔ 远景／低处 ↔ 高处\n日出：微明 → 色彩扩展 → 群峰显现\n方法：移步换景 + 定点分层',
      homework: [
        '基础：完善登山路线图，每一节点补一条文本依据。',
        '提升：写 200 字日出描写赏析，覆盖色彩、动态和空间层次。',
        '迁移：以一次行走为线索，写 150 字移步换景片段。',
      ],
      reflection: [
        '路线图是否帮助学生理解文章，而不是变成孤立的地理识记？',
        '学生对日出层次的解释是否覆盖观察顺序和语言证据？',
        '下一次应先处理文言疏通还是先建立时空框架？',
      ],
    },
  },
]

export function createHighSchoolChineseTeacherTemplate(): TeacherTemplateBundle {
  const pages: PageRecord[] = [
    page('root', null, '高中语文教师工作台｜高一上学期', '📚', [
      heading_1('root', 0, '教学、积累与复盘，从同一棵页面树开始'),
      paragraph('root', 1, '这是一份本地优先的高中语文教师工作台示例。先阅读模板说明，再从工作台进入规划、执行、资源、学情与复盘。'),
      child_page('root', 2, pageIds.guide),
      child_page('root', 3, pageIds.dashboard),
      child_page('root', 4, pageIds.planning),
      child_page('root', 5, pageIds.execution),
      child_page('root', 6, pageIds.resources),
      child_page('root', 7, pageIds.homework),
      child_page('root', 8, pageIds.reflection),
    ], 'forest'),
    page('guide', pageIds.root, '00 模板使用说明', '📌', [
      heading_1('guide', 0, '五分钟完成初始化'),
      paragraph('guide', 1, '先复制或导入模板，再用五分钟完成下面的最小设置；所有示例均可编辑，不会改动现有欢迎页。'),
      todo('guide', 2, '第 1 分钟：把学年学期改成自己的教学周期。'),
      todo('guide', 3, '第 2 分钟：仅保留自己任教的匿名班级标签。'),
      todo('guide', 4, '第 3 分钟：校准本周课次、截止日期和教学重点。'),
      todo('guide', 5, '第 4 分钟：把“待补充”的资料入口替换为自有合法资源。'),
      todo('guide', 6, '第 5 分钟：删除不适用的课文示例，并导出一份初始副本。'),
      heading_2('guide', 7, '必须修改'),
      bulleted_list('guide', 8, ['学年、学期、任教班级和示例日期。', '课程进度、作业截止时间和资源可用状态。']),
      heading_2('guide', 9, '可以删除'),
      bulleted_list('guide', 10, ['不任教的课文示例、无关班级、演示任务和提示文字。', '尚未采用的活动方案；删除前可先复制到教研灵感收件箱。']),
      heading_2('guide', 11, '建议保留'),
      bulleted_list('guide', 12, ['统一的课文备课结构、知识卡片结构、作业量规和复盘问题。', '所有隐私与版权边界提示，以及页面之间的导航关系。']),
      heading_2('guide', 13, '页面包与完整工作区备份'),
      table('guide', 14, [
        ['类型', '适合场景', '影响范围'],
        ['页面包', '分享或复用这一棵教师工作台', '导入为新的顶层页面，不覆盖现有内容'],
        ['完整工作区备份', '迁移或恢复整个本地工作区', '包含全局数据，恢复前必须确认覆盖范围'],
      ]),
      paragraph('guide', 15, '只记录班级层面的匿名观察；不要放入个人身份信息、分数数据、教材扫描件、商业课件或未获授权的音视频。'),
    ]),
    page('dashboard', pageIds.root, '01 教师工作台', '🏠', [
      heading_1('dashboard', 0, '2026—2027 学年第一学期'),
      paragraph('dashboard', 1, '任教班级：高一（3）班、高一（6）班。这里汇总本周重点和入口，具体进度以教学执行分支为准。'),
      heading_2('dashboard', 2, '本周聚焦'),
      bulleted_list('dashboard', 3, [
        '完成第七单元核心问题导入，让五篇课文共享同一比较维度。',
        '推进《荷塘月色》两课时：朗读与结构先行，语言与情感细读跟进。',
        '收集两班在修辞辨析、证据表达和文言句式上的共性表现。',
        '每节课后用四问完成十分钟复盘。',
      ]),
      heading_2('dashboard', 4, '本周节奏'),
      table('dashboard', 5, [
        ['类别', '当前动作', '完成证据'],
        ['备课', '校准目标、问题链与课堂表格', '一页可执行教案'],
        ['授课', '记录课堂生成和时间偏差', '板书照片或匿名观察'],
        ['批改', '归纳共性问题，不建立个人档案', '问题—证据—策略条目'],
        ['复盘', '保留有效设计并写下一次调整', '三条可复用结论'],
      ]),
      heading_2('dashboard', 6, '快速导航'),
      numbered_list('dashboard', 7, [
        '先看“第七单元｜自然情怀”确定单元目标与三周任务链。',
        '进入对应课文页，按统一的十段结构备课。',
        '到“04 资源与知识库”沉淀资料和知识卡片。',
        '到“05 作业与学情”记录匿名共性证据。',
        '最后在“06 复盘与成长”完成课后与单元复盘。',
      ]),
    ]),
    page('planning', pageIds.root, '02 教学规划', '🗓️', [
      heading_1('planning', 0, '从学期主线到单元任务'),
      paragraph('planning', 1, '先用学期教学地图保持全局视野，再进入第七单元完成目标、课文与评价的一致性设计。'),
      child_page('planning', 2, pageIds.semesterMap),
      child_page('planning', 3, pageIds.unit),
    ]),
    page('semester-map', pageIds.planning, '学期教学地图', '🧭', [
      heading_1('semester-map', 0, '学期教学地图｜文本版'),
      paragraph('semester-map', 1, '后续将在此页加入可编辑思维导图块；当前文本版已经可以用于周计划、单元衔接和教研讨论。'),
      heading_2('semester-map', 2, '四条学期主线'),
      table('semester-map', 3, [
        ['主线', '持续追问', '可观察成果'],
        ['阅读与鉴赏', '文本怎样组织语言、形象与情感？', '批注、赏析札记、比较阅读'],
        ['表达与交流', '怎样让观点有证据、表达有对象？', '口头陈述、微写作、完整作文'],
        ['梳理与探究', '概念、材料和问题怎样形成结构？', '知识卡片、专题表格、研究问题'],
        ['整本书阅读', '如何持续阅读、记录和修正理解？', '阅读日志、主题讨论、阶段成果'],
      ]),
      heading_2('semester-map', 4, '使用方法'),
      numbered_list('semester-map', 5, [
        '每个单元只确定一个核心问题和两项可迁移方法。',
        '每周检查四条主线是否至少有一条产生可见成果。',
        '月末把有效活动、学生共性困难和可复用资源回填到地图。',
      ]),
    ]),
    page('unit-7', pageIds.planning, '第七单元｜自然情怀', '🍃', [
      heading_1('unit-7', 0, '自然景物、生命感受与表达选择'),
      paragraph('unit-7', 1, '核心问题：作者如何借自然景物表达生命感受？五篇课文分别从现代散文、生命叙事、文言哲思和登临写景提供不同答案。'),
      child_page('unit-7', 2, pageIds.unitOverview),
      child_page('unit-7', 3, pageIds.lessonAutumn),
      child_page('unit-7', 4, pageIds.lessonLotus),
      child_page('unit-7', 5, pageIds.lessonDitan),
      child_page('unit-7', 6, pageIds.lessonChibi),
      child_page('unit-7', 7, pageIds.lessonTaishan),
      child_page('unit-7', 8, pageIds.unitTasks),
    ], 'mint'),
    page('unit-overview', pageIds.unit, '单元总览', '🎯', [
      heading_1('unit-overview', 0, '第七单元整体设计'),
      heading_2('unit-overview', 1, '单元主题'),
      paragraph('unit-overview', 2, '在不同历史处境和生命阶段中，作者选择、组织并感受自然景物，使景物成为认识自我、理解时间和表达情感的方式。'),
      heading_2('unit-overview', 3, '核心问题'),
      paragraph('unit-overview', 4, '作者如何借自然景物表达生命感受？'),
      heading_2('unit-overview', 5, '四项核心素养目标'),
      numbered_list('unit-overview', 6, [
        '语言建构：积累写景词语、文言词句和修辞分析的准确表达。',
        '思维发展：从景物选择、观察层次和篇章结构推断情感与思想。',
        '审美鉴赏：比较不同作品的景物特征、语言节奏和审美基调。',
        '文化理解：认识传统山水精神与现代生命体验的联系和差异。',
      ]),
      heading_2('unit-overview', 7, '三周任务链'),
      table('unit-overview', 8, [
        ['周次', '学习任务', '主要成果'],
        ['第 1 周', '朗读感知；细读《故都的秋》《荷塘月色》', '朗读标记、景物层次图、微写作'],
        ['第 2 周', '研读《我与地坛（节选）》；比较现代散文', '证据链、情感线索比较表'],
        ['第 3 周', '研读《赤壁赋》《登泰山记》；古今比较与单元整合', '主客问答图、游踪图、单元赏析札记'],
      ]),
      heading_2('unit-overview', 9, '评价设计'),
      bulleted_list('unit-overview', 10, [
        '形成性评价：朗读标记、课堂证据卡、问题链回答、比较表和微写作修改。',
        '终结性评价：完成一篇有景物层次、语言分析和生命感受的单元赏析札记。',
        '评价原则：概念准确、证据具体、解释连贯、迁移表达真实。',
      ]),
    ], 'aurora'),
    ...lessonSpecs.map(({ title, icon, spec }) => page(
      spec.slug,
      pageIds.unit,
      title,
      icon,
      createLessonBlocks(spec),
    )),
    page('unit-tasks', pageIds.unit, '单元学习任务与评价', '✅', [
      heading_1('unit-tasks', 0, '从感知、细读到迁移表达'),
      table('unit-tasks', 1, [
        ['阶段', '任务', '提交物', '评价重点'],
        ['朗读感知', '为一篇现代散文设计停连和重音', '朗读标记页', '节奏与情感一致'],
        ['文本细读', '解释一组景物选择或意象变化', '证据卡', '概念准确、证据具体'],
        ['比较阅读', '比较两篇作品的写景层次与生命感受', '比较表', '维度一致、结论有据'],
        ['微写作', '用多感官描写呈现一处熟悉景物', '修改前后两稿', '景物有序、情感克制'],
        ['单元成果', '完成自然情怀赏析札记', '成稿与自评', '解释连贯、能够迁移'],
      ]),
      heading_2('unit-tasks', 2, '学习者自检'),
      bulleted_list('unit-tasks', 3, ['我能指出景物选择，而不只概括景物特点。', '我能用具体语言证据解释情感变化。', '我能区分修辞名称、感官效果和表达目的。', '我能把一种阅读方法迁移到自己的写作。']),
    ]),
    page('execution', pageIds.root, '03 教学执行', '✅', [
      heading_1('execution', 0, '把计划变成可追踪的课堂行动'),
      paragraph('execution', 1, '本分支保留备课任务、教学进度和课堂流程入口。当前文本与表格可直接使用，后续还可接入数据表和白板。'),
      child_page('execution', 2, pageIds.preparationTasks),
      child_page('execution', 3, pageIds.calendar),
      child_page('execution', 4, pageIds.classroomBoard),
    ]),
    page('preparation-tasks', pageIds.execution, '备课与教学任务', '🧾', [
      heading_1('preparation-tasks', 0, '备课最小闭环'),
      numbered_list('preparation-tasks', 1, ['明确本课可观察目标。', '选择支撑目标的核心问题与证据。', '设计学习活动和形成性检查。', '准备分层作业与课后复盘入口。']),
      table('preparation-tasks', 2, [
        ['任务', '截止点', '完成标准'],
        ['文本细读', '上课前 2 天', '重点语句、问题链与可能误读已标注'],
        ['课堂材料', '上课前 1 天', '投屏、表格和板书布局可直接使用'],
        ['作业设计', '上课前', '基础、提升和迁移任务与目标一致'],
        ['课后复盘', '下课后 24 小时内', '证据、意外和下一次调整已记录'],
      ]),
    ]),
    page('calendar', pageIds.execution, '教学进度与日历', '📅', [
      heading_1('calendar', 0, '第七单元三周进度'),
      paragraph('calendar', 1, '日期以本校校历为准；先按课次确定成果，再填写实际日期，避免日历替代教学判断。'),
      table('calendar', 2, [
        ['课次', '核心内容', '课后动作'],
        ['1—2', '故都的秋：景物选择、色彩与南北比较', '收集比较阅读困难'],
        ['3—4', '荷塘月色：朗读、景物层次、通感与微写作', '整理修辞辨析证据'],
        ['5—6', '我与地坛：景物、生命体验与母亲形象', '检查人物分析证据链'],
        ['7—8', '赤壁赋：文言知识、主客问答、水月意象', '归纳虚词和结构问题'],
        ['9', '登泰山记：路线、时空层次与日出描写', '完成游踪图'],
        ['10', '比较阅读与单元成果', '完成单元复盘'],
      ]),
    ]),
    page('classroom-board', pageIds.execution, '第七单元课堂流程白板', '🧑‍🏫', [
      heading_1('classroom-board', 0, '课堂流程白板｜文本预案'),
      paragraph('classroom-board', 1, '后续将在此页接入可拖拽白板；当前预案可直接投屏或复制到备课页。'),
      code('classroom-board', 2, '单元主题 → 核心问题 → 文本研读 → 学习活动 → 学习成果 → 评价与复盘\n\n现代散文：故都的秋／荷塘月色／我与地坛\n古代山水：赤壁赋／登泰山记\n\n课堂生成区：新证据｜新问题｜待澄清概念'),
      heading_2('classroom-board', 3, '课堂使用规则'),
      bulleted_list('classroom-board', 4, ['每次只移动一个关键问题到“当前研读”。', '学生回答必须落在证据区，再进入结论区。', '未解决的问题放入课堂生成区，不用仓促封闭。']),
    ]),
    page('resources', pageIds.root, '04 资源与知识库', '🗂️', [
      heading_1('resources', 0, '把一次备课变成长期资产'),
      paragraph('resources', 1, '资源记录来源与可用状态，知识卡片沉淀概念和方法，写作素材保留可迁移观察。'),
      child_page('resources', 2, pageIds.resourceLibrary),
      child_page('resources', 3, pageIds.knowledgeCards),
      child_page('resources', 4, pageIds.writingLibrary),
      child_page('resources', 5, pageIds.unitMindmap),
    ]),
    page('resource-library', pageIds.resources, '教学资源库', '📎', [
      heading_1('resource-library', 0, '资源收集与使用边界'),
      paragraph('resource-library', 1, '只保存自制材料、合法公开入口和清晰的来源说明。需要授权的内容仅记录“待补充”，不把外部材料伪装成模板附件。'),
      table('resource-library', 2, [
        ['资源名称', '适用课文', '用途', '准备状态'],
        ['单元核心问题投屏页', '全单元', '导入与回扣', '已包含文本方案'],
        ['朗读停连标记模板', '荷塘月色', '朗读设计', '待按班级调整'],
        ['景物—情感证据卡', '现代散文', '文本细读', '已包含字段建议'],
        ['文言虚词归纳页', '赤壁赋', '语言积累', '待补充自有例句'],
        ['登山路线空白图', '登泰山记', '时空梳理', '可自行制作'],
      ]),
      heading_2('resource-library', 3, '入库前四问'),
      numbered_list('resource-library', 4, ['来源是否清楚且允许教学使用？', '它解决哪个具体学习困难？', '使用后能留下什么学习证据？', '下次复用需要补充什么说明？']),
    ]),
    page('knowledge-cards', pageIds.resources, '语文知识卡片', '🧠', [
      heading_1('knowledge-cards', 0, '概念、识别、辨析与迁移'),
      paragraph('knowledge-cards', 1, '每张卡片都使用同一结构。课内示例只作转述和方法说明，不复制教材原句。'),
      child_page('knowledge-cards', 2, pageIds.cardSceneEmotion),
      child_page('knowledge-cards', 3, pageIds.cardSynaesthesia),
      child_page('knowledge-cards', 4, pageIds.cardFigures),
      child_page('knowledge-cards', 5, pageIds.cardEr),
      child_page('knowledge-cards', 6, pageIds.cardMovingView),
      child_page('knowledge-cards', 7, pageIds.cardEmotionalThread),
    ]),
    page('card-scene-emotion', pageIds.knowledgeCards, '情景交融', '🌿', createKnowledgeCardBlocks(
      'card-scene-emotion',
      '作者通过景物选择、描写方式和叙述语气，使自然景象与人物情感互相生成，而不是把情感标签附加在景物之后。',
      '先圈景物和感官词，再找情感或语气变化，最后说明“为何选择这样的景、这样写会产生怎样的感受”。',
      '课堂可把北国秋景概括为低饱和色彩、稀疏声音和舒缓节奏，再解释这些选择如何形成清冷而眷恋的感受。',
      '有景物也有情感不一定就是情景交融；如果两者缺少语言和结构上的联系，只能算并列出现。',
      '任选校园一角写 100 字，先确定一种心境，再用两个景物细节让读者自行感受到它，避免直接说出情绪。',
    )),
    page('card-synaesthesia', pageIds.knowledgeCards, '通感', '🎵', createKnowledgeCardBlocks(
      'card-synaesthesia',
      '通感是用一种感觉领域的经验描写另一种感觉，使读者在视觉、听觉、嗅觉、味觉或触觉之间建立联想。',
      '先确认原本感官，再确认借用的感官，最后解释两种感受在强弱、节奏、质地或距离上的共同点。',
      '分析荷香时，可以把淡而断续的嗅觉感受转述为轻柔、遥远的听觉体验，由此说明香气的若有若无。',
      '比喻关注相似关系，通感必须发生跨感官转换；二者可能同时出现，但判断依据不同。',
      '分别把“灯光”“风声”改写成跨感官表达，并注明原感官、借用感官和希望产生的效果。',
    )),
    page('card-figures', pageIds.knowledgeCards, '比喻与拟人', '✨', createKnowledgeCardBlocks(
      'card-figures',
      '比喻借相似性把对象具体化，拟人赋予非人对象以人的动作、情态或意志；两者都应服务于特定观察和感受。',
      '比喻先找本体与喻体及相似点；拟人检查动作或心理是否具有人的特征，再说明表达效果。',
      '课堂可把荷叶的排列转述为有秩序地铺展，把荷花的姿态理解为带有人物情态，从而讨论画面的层次和生命感。',
      '出现“像”未必是比喻，写出人的动作也未必是拟人；必须判断表达对象、相似点和语境功能。',
      '为同一棵树分别写一个比喻句和一个拟人句，再比较哪一句更适合表现安静、蓬勃或孤独。',
    )),
    page('card-er', pageIds.knowledgeCards, '文言虚词“而”', '📜', createKnowledgeCardBlocks(
      'card-er',
      '“而”常连接词语或分句，可表示并列、承接、修饰、转折、因果等关系；判断要依赖前后语意，而不是机械翻译。',
      '先划分“而”前后成分，再判断动作是否先后、语意是否相反、前项是否修饰后项，最后尝试用现代关联词验证。',
      '在游览叙述中，若前项写行动、后项紧接新的观察，可按承接理解；若后项改变前项预期，则应考虑转折。',
      '同一虚词在不同句中功能可能不同；把所有“而”都译成“并且”会遮蔽主客问答和行动推进。',
      '从《赤壁赋》的自有课堂笔记中选择三处“而”，分别写出前后成分、关系类型和不超过 20 字的解释。',
    )),
    page('card-moving-view', pageIds.knowledgeCards, '移步换景', '🚶', createKnowledgeCardBlocks(
      'card-moving-view',
      '移步换景是随着观察者位置、路线或时间变化依次呈现景物，使空间展开与体验过程保持一致。',
      '找地点、方位、动作和时间标记，画出观察路线，再检查每次位置变化带来了什么新画面。',
      '分析登临文章时，可按山麓、途中、山顶和等待日出等节点复原路线，解释视野扩大如何增强最终景观的力量。',
      '景物依次出现不一定是移步换景；如果观察位置没有变化，可能属于定点观察中的远近或上下分层。',
      '沿“校门—走廊—教室”写 120 字，至少发生两次位置变化，并让每次移动带出新的观察重点。',
    )),
    page('card-emotional-thread', pageIds.knowledgeCards, '散文的情感线索', '🧵', createKnowledgeCardBlocks(
      'card-emotional-thread',
      '情感线索是贯穿散文并发生推进、回旋或转折的心境脉络，常与行踪、景物、事件和叙述时间交织。',
      '标出情感词和语气变化，再寻找触发变化的景物、事件或回忆，最后用箭头写出变化及其证据。',
      '梳理月下行走时，可以把出门前的心绪、观景时的暂时舒展和归途中的回落连接起来，观察景色与心境如何互相影响。',
      '情感线索不是把每段贴上“喜怒哀乐”；应解释变化的触发点、持续时间和是否真正完成转化。',
      '为一篇熟悉的散文画三节点情感曲线，每个节点补一条景物或叙事证据，并写出一次可能的误读。',
    )),
    page('writing-library', pageIds.resources, '写作素材库', '✍️', [
      heading_1('writing-library', 0, '从观察记录到可迁移表达'),
      heading_2('writing-library', 1, '自然景物观察单'),
      table('writing-library', 2, [
        ['观察维度', '记录提示'],
        ['位置与路线', '我从哪里看，视线怎样移动？'],
        ['时间与光线', '光线、色彩和影子怎样变化？'],
        ['多种感官', '除视觉外，还有什么声音、气味或触感？'],
        ['细节与情感', '哪个细节最能承载当时的生命感受？'],
      ]),
      heading_2('writing-library', 3, '微写作提示'),
      numbered_list('writing-library', 4, ['写一处熟悉景物在一天中两个时刻的变化。', '用一种通感表现若有若无、明暗变化或远近感。', '沿一段真实路线组织三层景物，让情感只通过细节显现。', '删去直接抒情句，检查景物能否独立传达心境。']),
    ]),
    page('unit-mindmap', pageIds.resources, '第七单元知识导图', '🌿', [
      heading_1('unit-mindmap', 0, '自然情怀知识导图｜文本骨架'),
      paragraph('unit-mindmap', 1, '后续将在此页加入思维导图块；当前骨架可用于课前预习、单元回顾和知识卡片索引。'),
      code('unit-mindmap', 2, '自然情怀\n├─ 现代散文：故都的秋／荷塘月色／我与地坛\n├─ 古代山水：赤壁赋／登泰山记\n├─ 阅读方法：景物选择／层次／情感线索／比较阅读\n├─ 表达知识：情景交融／通感／比喻拟人／移步换景／虚词“而”\n└─ 单元成果：朗读标记／赏析札记／微写作'),
    ]),
    page('homework', pageIds.root, '05 作业与学情', '📝', [
      heading_1('homework', 0, '作业服务目标，观察服务调整'),
      paragraph('homework', 1, '本分支只记录班级层面的共性证据和教学策略，不建立个体档案。'),
      child_page('homework', 2, pageIds.homeworkDesign),
      child_page('homework', 3, pageIds.commonIssues),
      child_page('homework', 4, pageIds.classObservation),
    ]),
    page('homework-design', pageIds.homework, '作业设计与评价', '✅', [
      heading_1('homework-design', 0, '第七单元作业菜单'),
      table('homework-design', 1, [
        ['类型', '任务示例', '目标'],
        ['基础巩固', '整理景物、文言词句和篇章结构', '准确识别与复述'],
        ['文本分析', '用“表达—感受—作用”分析一个语言细节', '证据阐释'],
        ['比较阅读', '用同一维度比较两篇作品', '建立联系与差异'],
        ['微写作', '用多感官或移步换景写熟悉景物', '方法迁移'],
        ['分层任务', '基础完成证据卡；提升形成完整赏析；拓展尝试跨文本问题', '提供不同进入路径'],
      ]),
      heading_2('homework-design', 2, '单元成果量规'),
      table('homework-design', 3, [
        ['维度', '达成', '发展中', '需支持'],
        ['概念使用', '术语准确并能解释', '术语基本准确但解释笼统', '术语混用或只贴标签'],
        ['文本证据', '证据具体且与结论对应', '有证据但对应关系不清', '缺少文本依据'],
        ['分析逻辑', '从语言到感受再到主题连贯推进', '部分环节跳跃', '只有结论或复述'],
        ['迁移表达', '景物有层次且情感自然生成', '方法可见但较机械', '堆叠修辞或直接抒情'],
      ]),
      heading_2('homework-design', 4, '反馈原则'),
      bulleted_list('homework-design', 5, ['先指出一条有效证据，再指出一个最小修改点。', '同一轮反馈只聚焦一个核心维度。', '用修改前后对照证明反馈是否有效。']),
    ]),
    page('common-issues', pageIds.homework, '作业共性问题台账', '🔎', [
      heading_1('common-issues', 0, '从共性问题到下一次教学动作'),
      table('common-issues', 1, [
        ['问题', '班级证据', '可能原因', '改进策略', '复查点'],
        ['修辞分析停在术语', '答案只写“用了通感”', '缺少跨感官与效果支架', '使用“原感官—借用感官—共同感受”句式', '下一次赏析题'],
        ['情感判断缺少证据', '结论集中但引用笼统', '景物与情感未建立对应', '先做景物—语言—感受三列表', '比较阅读任务'],
        ['文言虚词机械翻译', '多处统一译法', '未划分前后成分', '先判断关系再决定是否翻译', '赤壁赋复习'],
      ]),
      paragraph('common-issues', 2, '新增条目时只写匿名班级证据，不记录个人身份；策略必须能在下一次课堂中被观察和复查。'),
    ]),
    page('class-observation', pageIds.homework, '班级教学观察', '👀', [
      heading_1('class-observation', 0, '匿名班级观察'),
      paragraph('class-observation', 1, '观察对象仅为高一（3）班和高一（6）班的整体学习表现。记录课堂证据、教学判断和下一步，不记录个体信息。'),
      table('class-observation', 2, [
        ['班级', '观察主题', '课堂证据', '下一步'],
        ['高一（3）班', '修辞效果解释', '能够辨认形式，效果表述趋同', '增加一般表达与文本表达对照'],
        ['高一（6）班', '文本证据组织', '能找句子，但证据与结论连接较弱', '使用证据链口头演练'],
      ]),
      heading_2('class-observation', 3, '记录提示'),
      bulleted_list('class-observation', 4, ['事实：课堂上具体发生了什么？', '判断：它说明哪个学习环节需要支持？', '行动：下节课做一个怎样的最小调整？', '复查：用什么证据判断调整有效？']),
    ]),
    page('reflection', pageIds.root, '06 复盘与成长', '🔄', [
      heading_1('reflection', 0, '把经验写成下次可用的决定'),
      paragraph('reflection', 1, '课后复盘关注单课证据，单元复盘关注结构性经验，教研收件箱暂存尚未成熟的想法。'),
      child_page('reflection', 2, pageIds.afterClassReflection),
      child_page('reflection', 3, pageIds.unitReflection),
      child_page('reflection', 4, pageIds.researchInbox),
    ]),
    page('after-class-reflection', pageIds.reflection, '课后复盘', '🪞', [
      heading_1('after-class-reflection', 0, '课后十分钟复盘'),
      numbered_list('after-class-reflection', 1, ['目标达成：哪一项目标有可观察证据，哪一项仍只是教师感觉？', '课堂证据：哪一个回答、作品或讨论变化最能说明学习发生？', '意外情况：时间、问题理解或活动组织出现了什么偏差？', '下次调整：只改一个最关键环节，具体改什么？']),
      heading_2('after-class-reflection', 2, '可复用补充问题'),
      bulleted_list('after-class-reflection', 3, ['哪个问题真正推动了细读？', '哪个支架帮助了更多学习者，哪个支架反而限制表达？', '哪份课堂生成值得进入资源库或知识卡片？', '如果少十分钟，最应该保留什么？']),
    ]),
    page('unit-reflection', pageIds.reflection, '单元复盘', '📘', [
      heading_1('unit-reflection', 0, '第七单元复盘框架'),
      table('unit-reflection', 1, [
        ['复盘维度', '提示'],
        ['有效设计', '哪些任务真正连接了景物、语言和生命感受？'],
        ['共性困难', '两个班在哪些概念、证据或表达环节反复受阻？'],
        ['资源复用', '哪些表格、板书和问题链值得保留，使用条件是什么？'],
        ['下轮建议', '课文顺序、课时分配和评价任务应如何调整？'],
      ]),
      heading_2('unit-reflection', 2, '复盘产出'),
      numbered_list('unit-reflection', 3, ['写三条有证据的结论。', '删除一个低效活动。', '升级一张知识卡片或一份作业量规。', '为下一轮教学留下一个待验证假设。']),
    ]),
    page('research-inbox', pageIds.reflection, '教研灵感收件箱', '💡', [
      heading_1('research-inbox', 0, '先捕捉，再判断是否值得发展'),
      paragraph('research-inbox', 1, '这里收集尚未归类的案例、问题和活动构思；每周整理一次，能够行动的移入备课任务，能够复用的移入资源库。'),
      heading_2('research-inbox', 2, '灵感记录模板'),
      numbered_list('research-inbox', 3, ['触发：哪个课堂现象、阅读片段或教研讨论引发了想法？', '问题：它试图解决什么真实教学困难？', '假设：如果改变一个环节，可能出现什么可观察变化？', '最小试验：下周在哪个班、哪一课、用多长时间验证？', '证据：保留什么匿名课堂产出来判断是否有效？']),
      heading_2('research-inbox', 4, '待探索问题'),
      bulleted_list('research-inbox', 5, ['朗读标记是否能稳定提升散文结构理解？', '比较阅读表格何时提供支架，何时限制开放解释？', '微写作怎样从“使用修辞”转向“表达真实感受”？']),
    ]),
  ]

  return {
    rootPageId: pageIds.root,
    pages,
    boards: [],
    dataTables: [],
    mindmaps: [],
    syncedBlockGroups: [],
    assets: [],
  }
}
