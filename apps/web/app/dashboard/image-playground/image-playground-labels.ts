/** Route-local bilingual consumer copy — every key must exist in en + zh. */

export type ImagePlaygroundLocale = "en" | "zh";

const LOCALE_STORAGE_KEY = "tokfai-locale";

const EN: Record<string, string> = {
  "dashboard.apiKeys.copied": "Copied",
  "dashboard.shell.lowCredits": "Low credits",

  "dashboard.imageWorkbench.title": "Image workbench",
  "dashboard.imageWorkbench.subtitle":
    "Upload a product or person photo. Analyze it, write product copy, or create and edit images.",
  "dashboard.imageWorkbench.tabAnalysis": "Image analysis",
  "dashboard.imageWorkbench.tabCopy": "Product copywriting",
  "dashboard.imageWorkbench.tabGenerate": "Create or edit images",
  "dashboard.imageWorkbench.analysisTitle": "Image analysis",
  "dashboard.imageWorkbench.analysisDesc":
    "Upload an image to understand content, audience, selling points, risks, and platform fit. Does not create a new image.",
  "dashboard.imageWorkbench.copyTitle": "Product copywriting",
  "dashboard.imageWorkbench.copyDesc":
    "Upload an image and add notes to get titles, selling points, detail-page copy, ads, and social posts. Does not create a new image.",
  "dashboard.imageWorkbench.uploadLabel": "Upload image",
  "dashboard.imageWorkbench.uploadHint": "Drag and drop or click to upload",
  "dashboard.imageWorkbench.removeImage": "Remove",
  "dashboard.imageWorkbench.useCaseLabel": "Use case",
  "dashboard.imageWorkbench.extraNeedLabel": "Extra notes (optional)",
  "dashboard.imageWorkbench.extraNeedPlaceholder":
    "Optional notes, e.g. focus on gift-set angle",
  "dashboard.imageWorkbench.balanceLabel": "Credits balance",
  "dashboard.imageWorkbench.startAnalyze": "Analyze",
  "dashboard.imageWorkbench.startCopy": "Write copy",
  "dashboard.imageWorkbench.analyzing": "Analyzing…",
  "dashboard.imageWorkbench.analyzingHint": "Understanding your image…",
  "dashboard.imageWorkbench.resultTitle": "Results",
  "dashboard.imageWorkbench.resultDesc": "What Tokfai found in your image.",
  "dashboard.imageWorkbench.resultEmpty": "Upload an image and start to see results here.",
  "dashboard.imageWorkbench.copyResult": "Copy results",
  "dashboard.imageWorkbench.copied": "Copied",
  "dashboard.imageWorkbench.viewUsage": "View usage",
  "dashboard.imageWorkbench.advancedInfo": "Details",
  "dashboard.imageWorkbench.modelLabel": "Model",
  "dashboard.imageWorkbench.chargedLabel": "Credits used",
  "dashboard.imageWorkbench.needImage": "Please upload an image first.",
  "dashboard.imageWorkbench.uploadFailed": "Image upload failed. Try again.",
  "dashboard.imageWorkbench.analyzeFailed":
    "This attempt did not complete. Failed calls are usually not charged. Try simplifying the request and retry.",
  "dashboard.imageWorkbench.noKeyBody":
    "We're preparing your experience key. Refresh or try again in a moment.",
  "dashboard.imageWorkbench.createKey": "Try again",
  "dashboard.imageWorkbench.creatingKey": "Preparing…",
  "dashboard.imageWorkbench.keyPrepareFailed":
    "We're preparing your experience key. Refresh or try again in a moment.",
  "dashboard.imageWorkbench.tabAnalysisDesc":
    "Understand the image — product type, audience, selling points, risks, and platform suggestions. Does not generate images.",
  "dashboard.imageWorkbench.tabCopyDesc":
    "Write titles, selling points, detail-page copy, ads, and social posts. Does not generate images.",
  "dashboard.imageWorkbench.tabGenerateDesc":
    "Create new images or edit with a reference photo. For writing, use Product copywriting.",
  "dashboard.imageWorkbench.copyUseCaseLabel": "Copy purpose",
  "dashboard.imageWorkbench.copyExtraPlaceholder":
    "e.g. formalwear copy for interviews and office looks",
  "dashboard.imageWorkbench.copying": "Writing copy…",
  "dashboard.imageWorkbench.copyingHint": "Drafting ready-to-use product copy…",
  "dashboard.imageWorkbench.copyResultTitle": "Copy results",
  "dashboard.imageWorkbench.copyResultDesc":
    "Ready-to-copy titles, bullets, body copy, and ads.",
  "dashboard.imageWorkbench.copyResultEmpty":
    "Upload an image and click Write copy to see results here.",
  "dashboard.imageWorkbench.analysisResultTitle": "Analysis results",
  "dashboard.imageWorkbench.analysisResultDesc":
    "Image understanding and scenario judgment.",
  "dashboard.imageWorkbench.analysisResultEmpty":
    "Upload an image and click Analyze to see results here.",
  "dashboard.imageWorkbench.copyAllCopy": "Copy all",
  "dashboard.imageWorkbench.regenerate": "Try again",
  "dashboard.imageWorkbench.copyFailed":
    "This attempt did not complete. Failed calls are usually not charged. Try simplifying the request and retry.",
  "dashboard.imageWorkbench.timeoutFriendly":
    "This attempt did not complete. Failed calls are usually not charged. Try simplifying the request and retry.",

  "dashboard.imageWorkbench.generateSubtitle":
    "Create listing images, posters, and reference edits. Use Product copywriting for text.",
  "dashboard.imageWorkbench.progressTitle": "Working on your request",
  "dashboard.imageWorkbench.progressPatienceVision":
    "Keep this page open. Text results are usually faster than image generation.",
  "dashboard.imageWorkbench.progressPatienceImage":
    "Image generation usually takes 20–60 seconds. Please keep this page open…",
  "dashboard.imageWorkbench.imageProgressTitle": "Creating your image",
  "dashboard.imageWorkbench.imageTimeoutFriendly":
    "This attempt did not complete. Failed calls are usually not charged. Try simplifying the request and retry.",
  "dashboard.imageWorkbench.imageFailFriendly":
    "This attempt did not complete. Failed calls are usually not charged. Try simplifying the request and retry.",
  "dashboard.imageWorkbench.noChargeHint":
    "This attempt did not succeed and usually will not use credits.",
  "dashboard.imageWorkbench.billingUnknownHint":
    "Billing follows your usage records. Open Details if you need support info.",
  "dashboard.imageWorkbench.goToCopy": "Write product copy",
  "dashboard.imageWorkbench.goToGenerate": "Create or edit with this image",
  "dashboard.imageWorkbench.goToGenerateFromCopy": "Create image from this copy",
  "dashboard.imageWorkbench.simplifyRetry": "Simplify and retry",
  "dashboard.imageWorkbench.copyRequestId": "Copy request ID",
  "dashboard.imageWorkbench.successComplete": "Done",
  "dashboard.imageWorkbench.creditsUsed": "Credits used this time: {credits}",

  "dashboard.imageWorkbench.imageStage1": "Reading your image...",
  "dashboard.imageWorkbench.imageStage2": "Understanding your request...",
  "dashboard.imageWorkbench.imageStage3": "Calling the image model...",
  "dashboard.imageWorkbench.imageStage4":
    "Image generation usually takes 20–60 seconds. Please keep this page open...",
  "dashboard.imageWorkbench.imageStage5": "Saving the result...",
  "dashboard.imageWorkbench.imageStage6": "Almost done...",
  "dashboard.imageWorkbench.imageStageStillRunning":
    "Generation is still running. Complex reference images may take longer.",
  "dashboard.imageWorkbench.statusQueued": "Queued",
  "dashboard.imageWorkbench.statusValidating": "Validating request",
  "dashboard.imageWorkbench.statusBillingCheck": "Checking credits",
  "dashboard.imageWorkbench.statusRequestingModel": "Sending request",
  "dashboard.imageWorkbench.statusGenerating": "Generating image",
  "dashboard.imageWorkbench.statusSavingResult": "Saving result",
  "dashboard.imageWorkbench.statusCompleted": "Completed",
  "dashboard.imageWorkbench.statusFailed": "Failed",
  "dashboard.imageWorkbench.progressPercent": "{percent}%",
  "dashboard.imageWorkbench.visionStage1": "Reading your image...",
  "dashboard.imageWorkbench.visionStage2": "Understanding your request...",
  "dashboard.imageWorkbench.visionStage3": "Analyzing content and context...",
  "dashboard.imageWorkbench.visionStage4": "Organizing the results...",
  "dashboard.imageWorkbench.visionStage5": "Almost done...",
  "dashboard.imageWorkbench.visionStageStillRunning":
    "Still working. Detailed analysis may take a little longer.",
  "dashboard.imageWorkbench.waitedSeconds": "Waited {seconds}s",

  "dashboard.playground.selectKey": "Select key",
  "dashboard.playground.testKeyCreated":
    "Test key created. Copy the full secret — it won't be shown again after refresh.",
  "dashboard.playground.copySecret": "Copy secret",
  "dashboard.playground.copied": "Copied",
  "dashboard.playground.apiKeyLoadTimedOut":
    "We're preparing your experience key. Refresh or try again in a moment.",

  "dashboard.imagePlayground.title": "Create or edit images",
  "dashboard.imagePlayground.toolbenchSubtitle":
    "Describe an image, or upload a reference photo to edit.",
  "dashboard.imagePlayground.toolbenchInputTitle": "Input",
  "dashboard.imagePlayground.textToImage": "Text to image",
  "dashboard.imagePlayground.imageToImage": "Edit with reference",
  "dashboard.imagePlayground.waitingForImages": "Waiting for images to finish preparing…",
  "dashboard.imagePlayground.inputImagesTitle": "Reference images",
  "dashboard.imagePlayground.inputImagesDesc":
    "Drag, upload, or paste URLs. Up to {max} images (PNG, JPG, WEBP). Leave empty to create from text only.",
  "dashboard.imagePlayground.inputImagesDragTitle": "Drag images here or click to upload",
  "dashboard.imagePlayground.inputImagesDragHint": "PNG, JPG, WEBP · max 10 MB each",
  "dashboard.imagePlayground.inputImagesUrlPlaceholder":
    "Image or page URL — Tokfai extracts the image when possible",
  "dashboard.imagePlayground.addImageUrl": "Add URL",
  "dashboard.imagePlayground.modelComingSoon":
    "This model is coming soon and cannot be used here yet.",
  "dashboard.imagePlayground.toolbenchApiKeyLabel": "API Key",
  "dashboard.imagePlayground.toolbenchNoKey":
    "Create an API key on the API Keys page to call the Image API from your apps.",
  "dashboard.imagePlayground.createTestKey": "Create test key",
  "dashboard.imagePlayground.createApiKey": "Create an API key",
  "dashboard.imagePlayground.toolbenchPasteKeyShort": "Paste key",
  "dashboard.imagePlayground.toolbenchManageKeysShort": "Manage",
  "dashboard.imagePlayground.toolbenchCurrentKeyLine": "Current: {name} · {prefix}…",
  "dashboard.imagePlayground.toolbenchRunSettings": "Settings",
  "dashboard.imagePlayground.toolbenchBalanceLabel": "Credits",
  "dashboard.imagePlayground.estimatedCost": "Estimated: {credits} credits",
  "dashboard.imagePlayground.toolbenchInsufficientCredits":
    "Not enough credits — add credits before generating.",
  "dashboard.imagePlayground.topUp": "Add credits",
  "dashboard.imagePlayground.toolbenchModelLabel": "Model",
  "dashboard.imagePlayground.size": "Size",
  "dashboard.imagePlayground.toolbenchBillingNoteShort":
    "Successful generations use credits. Failed calls are usually not charged.",
  "dashboard.imagePlayground.toolbenchServiceDocs": "Service docs",
  "dashboard.imagePlayground.toolbenchViewImageApiDocs": "Image API docs",
  "dashboard.imagePlayground.viewUsage": "View usage",
  "dashboard.imagePlayground.viewCredits": "View credits",
  "dashboard.imagePlayground.toolbenchOpenIntegrationDocs": "Integration docs",
  "dashboard.imagePlayground.generating": "Creating…",
  "dashboard.imagePlayground.preparingImages": "Preparing images…",
  "dashboard.imagePlayground.generate": "Create",
  "dashboard.imagePlayground.generateFromReference": "Edit from reference",
  "dashboard.imagePlayground.referenceImageRequired":
    "Please upload a reference image first. This request needs the original photo so Tokfai can keep the subject and only change what you ask.",
  "dashboard.imagePlayground.referenceEditResultTitle": "Edited image",
  "dashboard.imagePlayground.subjectDriftHint":
    "If the subject changed too much, try Strengthen subject preserve and retry.",
  "dashboard.imagePlayground.strengthenSubjectRetry": "Strengthen subject preserve and retry",
  "dashboard.imagePlayground.copyApiRequest": "Copy API request",
  "dashboard.imagePlayground.toolbenchResultLoadingTitle": "Creating…",
  "dashboard.imagePlayground.toolbenchResultPanelTitle": "Result",
  "dashboard.imagePlayground.toolbenchResultLoadingHint":
    "Keep this panel visible. The result will appear here.",
  "dashboard.imagePlayground.errors.billingNotChargedHint":
    "Failed requests are usually not charged. See Usage / Credits for the official record.",
  "dashboard.imagePlayground.toolbenchRetry": "Try again",
  "dashboard.imagePlayground.toolbenchResultPlaceholder": "Your image will appear here",
  "dashboard.imagePlayground.base64OnlyHint":
    "The result came back as image data. Preview may be limited — try again or check Usage.",
  "dashboard.imagePlayground.successReconcileHint":
    "Open Details if you need a request ID for support.",
  "dashboard.imagePlayground.copiedRequestId": "Copied",
  "dashboard.imagePlayground.copyRequestId": "Copy request ID",
  "dashboard.imagePlayground.viewImageApiDocs": "Image API docs",
  "dashboard.imagePlayground.successCreditsCharged": "Credits used this time: {credits}",
  "dashboard.imagePlayground.successComplete": "Generation complete",
  "dashboard.imagePlayground.metaModel": "Model",
  "dashboard.imagePlayground.metaCreatedAt": "Created at",
  "dashboard.imagePlayground.modeText": "Create from text",
  "dashboard.imagePlayground.modeReference": "Edit with reference",
  "dashboard.imagePlayground.modeTextHint": "Describe the image you want to create.",
  "dashboard.imagePlayground.modeReferenceHint":
    "Upload a reference photo, then describe only what to change.",
  "dashboard.imagePlayground.fastModelEditHint":
    "Faster models are better for drafts. For keeping the same person, prefer a standard or Pro model.",
  "dashboard.imagePlayground.subjectPreserveHonesty":
    "Tokfai will try to keep the reference subject, but outfit or scene changes may still cause slight identity drift.",
  "dashboard.imagePlayground.subjectPreserveExpectation":
    "Tokfai will try to keep the reference subject, but outfit or scene changes may still cause slight identity drift.",
  "dashboard.imagePlayground.referenceEditResultHint":
    "Tokfai will try to keep the same subject, but minor differences may still happen.",
  "dashboard.imagePlayground.errors.blobUrlBlocked":
    "Browser local image links cannot be sent. Please re-upload the image file.",
  "dashboard.imagePlayground.errors.referenceImageUnreadable":
    "The reference image could not be read. Please re-upload and try again.",
  "dashboard.imagePlayground.errors.referenceImageMissing":
    "Upload a reference image before keeping the subject while editing.",
  "dashboard.imagePlayground.errors.modelNotForSubjectPreserve":
    "This model is better for creating new images. Switch to a model that supports reference edits.",
  "dashboard.imagePlayground.errors.invalidImageUrl":
    "Enter a valid http or https URL.",
  "dashboard.imagePlayground.errors.uploadFailed": "Upload failed. Please try again.",
  "dashboard.imagePlayground.errors.previewFailed": "Could not load image preview.",
  "dashboard.imagePlayground.errors.previewUrlFailed":
    "Could not load image from this URL.",
  "dashboard.imagePlayground.errors.inputUnusable":
    "This input image cannot be used.",
  "dashboard.imagePlayground.errors.waitingForImages":
    "Wait for input images to finish uploading or resolving.",
  "dashboard.imagePlayground.preparingShort": "Preparing…",
  "dashboard.imagePlayground.resolvingShort": "Resolving…",
  "dashboard.imagePlayground.createExperienceKey": "Try again",
  "dashboard.imagePlayground.creatingKey": "Preparing…",
  "dashboard.imagePlayground.noKeyBody":
    "We're preparing your experience key. Refresh or try again in a moment.",
  "dashboard.imagePlayground.continueGenerate": "Generate again",
  "dashboard.imagePlayground.technicalDetails": "Details",
  "dashboard.imagePlayground.presetProduct": "Product shot",
  "dashboard.imagePlayground.presetAvatar": "Avatar",
  "dashboard.imagePlayground.presetEcommerce": "E-commerce hero",
  "dashboard.imagePlayground.presetPoster": "Poster",
  "dashboard.imagePlayground.presetProductPrompt":
    "Create a clean product-style image of a futuristic API dashboard, soft lighting, minimal background.",
  "dashboard.imagePlayground.presetAvatarPrompt":
    "Create a friendly professional avatar portrait, soft lighting, neutral background, high detail.",
  "dashboard.imagePlayground.presetEcommercePrompt":
    "Create a polished e-commerce hero image with a product on a minimal studio background, commercial lighting.",
  "dashboard.imagePlayground.presetPosterPrompt":
    "Create a modern promotional poster with bold composition, clean typography space, premium commercial style.",
  "dashboard.imagePlayground.errors.missingToken":
    "We're preparing your experience key. Refresh or try again in a moment.",
  "dashboard.imagePlayground.errors.invalidToken":
    "We're preparing your experience key. Refresh or try again in a moment.",
  "dashboard.imagePlayground.errors.invalidOrMissingToken":
    "We're preparing your experience key. Refresh or try again in a moment.",
  "dashboard.imagePlayground.errors.insufficientCredits":
    "Not enough credits. Add credits first.",
  "dashboard.imagePlayground.errors.upstreamTimeout":
    "This attempt did not complete. Failed calls are usually not charged. Try simplifying the request and retry.",
  "dashboard.imagePlayground.errors.upstreamError":
    "This attempt did not complete. Failed calls are usually not charged. Try simplifying the request and retry.",
  "dashboard.imagePlayground.errors.imageGenerationFailed":
    "This attempt did not complete. Failed calls are usually not charged. Try simplifying the request and retry.",
  "dashboard.imagePlayground.errors.missingPrompt": "Please enter a prompt.",
  "dashboard.imagePlayground.errors.keyNotRetrievable":
    "We're preparing your experience key. Refresh or try again in a moment.",
  "dashboard.imagePlayground.errors.unknown":
    "This attempt did not complete. Failed calls are usually not charged. Try simplifying the request and retry.",
  "dashboard.imagePlayground.errors.pageImageNotFound":
    "Could not find a usable image on this page. Try another URL or upload the image directly.",
  "dashboard.imagePlayground.errors.tooManyImages": "Up to {max} input images are allowed.",
  "dashboard.imagePlayground.errors.invalidDrop": "Drop PNG, JPG, or WEBP image files.",
  "dashboard.imagePlayground.errors.modelNotFound": "Model not found.",
  "dashboard.imagePlayground.errors.modelNotAvailable":
    "This model is not available here yet.",
};

const ZH: Record<string, string> = {
  "dashboard.apiKeys.copied": "已复制",
  "dashboard.shell.lowCredits": "算力积分较低",

  "dashboard.imageWorkbench.title": "图片工作台",
  "dashboard.imageWorkbench.subtitle":
    "上传商品图或人物图。可以看懂图片、写商品文案，也可以生成或改图。",
  "dashboard.imageWorkbench.tabAnalysis": "看懂图片",
  "dashboard.imageWorkbench.tabCopy": "写商品文案",
  "dashboard.imageWorkbench.tabGenerate": "生成 / 改图",
  "dashboard.imageWorkbench.analysisTitle": "看懂图片",
  "dashboard.imageWorkbench.analysisDesc":
    "上传图片，输出图片理解、商品类型、人群、卖点、风险与平台建议。不生成新图片。",
  "dashboard.imageWorkbench.copyTitle": "写商品文案",
  "dashboard.imageWorkbench.copyDesc":
    "上传图片并补充需求，输出标题、卖点、详情页文案、广告文案与小红书/淘宝/独立站文案。不生成新图片。",
  "dashboard.imageWorkbench.uploadLabel": "上传图片",
  "dashboard.imageWorkbench.uploadHint": "拖拽或点击上传",
  "dashboard.imageWorkbench.removeImage": "移除",
  "dashboard.imageWorkbench.useCaseLabel": "用途",
  "dashboard.imageWorkbench.extraNeedLabel": "补充需求（可选）",
  "dashboard.imageWorkbench.extraNeedPlaceholder":
    "可选补充说明，例如：关注礼盒装角度",
  "dashboard.imageWorkbench.balanceLabel": "算力积分余额",
  "dashboard.imageWorkbench.startAnalyze": "开始分析",
  "dashboard.imageWorkbench.startCopy": "生成文案",
  "dashboard.imageWorkbench.analyzing": "分析中…",
  "dashboard.imageWorkbench.analyzingHint": "正在理解你的图片…",
  "dashboard.imageWorkbench.resultTitle": "结果",
  "dashboard.imageWorkbench.resultDesc": "Tokfai 对图片的理解结果。",
  "dashboard.imageWorkbench.resultEmpty": "上传图片后开始，结果会显示在这里。",
  "dashboard.imageWorkbench.copyResult": "复制结果",
  "dashboard.imageWorkbench.copied": "已复制",
  "dashboard.imageWorkbench.viewUsage": "查看用量",
  "dashboard.imageWorkbench.advancedInfo": "详情",
  "dashboard.imageWorkbench.modelLabel": "模型",
  "dashboard.imageWorkbench.chargedLabel": "本次消耗",
  "dashboard.imageWorkbench.needImage": "请先上传图片。",
  "dashboard.imageWorkbench.uploadFailed": "图片上传失败，请重试。",
  "dashboard.imageWorkbench.analyzeFailed":
    "这次没有成功，通常不会扣费。你可以简化需求后重试。",
  "dashboard.imageWorkbench.noKeyBody":
    "系统正在准备体验密钥，请刷新或稍后重试。",
  "dashboard.imageWorkbench.createKey": "重试",
  "dashboard.imageWorkbench.creatingKey": "准备中…",
  "dashboard.imageWorkbench.keyPrepareFailed":
    "系统正在准备体验密钥，请刷新或稍后重试。",
  "dashboard.imageWorkbench.tabAnalysisDesc":
    "理解图片内容、商品类型、人群、卖点、风险与平台建议。不生成图片。",
  "dashboard.imageWorkbench.tabCopyDesc":
    "生成标题、卖点、详情页文案、广告文案与社媒文案。不生成图片。",
  "dashboard.imageWorkbench.tabGenerateDesc":
    "生成新图，或用参考图改图。写文案请用「写商品文案」。",
  "dashboard.imageWorkbench.copyUseCaseLabel": "文案用途",
  "dashboard.imageWorkbench.copyExtraPlaceholder":
    "例如：做西装文案，面向面试/通勤/商务会议",
  "dashboard.imageWorkbench.copying": "生成文案中…",
  "dashboard.imageWorkbench.copyingHint": "正在生成可直接使用的商品文案…",
  "dashboard.imageWorkbench.copyResultTitle": "文案结果",
  "dashboard.imageWorkbench.copyResultDesc":
    "可直接复制的标题、卖点、正文与广告短句。",
  "dashboard.imageWorkbench.copyResultEmpty":
    "上传图片并点击生成文案，结果会显示在这里。",
  "dashboard.imageWorkbench.analysisResultTitle": "分析结果",
  "dashboard.imageWorkbench.analysisResultDesc": "图片理解与场景判断。",
  "dashboard.imageWorkbench.analysisResultEmpty":
    "上传图片并点击开始分析，结果会显示在这里。",
  "dashboard.imageWorkbench.copyAllCopy": "复制全部",
  "dashboard.imageWorkbench.regenerate": "再试一次",
  "dashboard.imageWorkbench.copyFailed":
    "这次没有成功，通常不会扣费。你可以简化需求后重试。",
  "dashboard.imageWorkbench.timeoutFriendly":
    "这次没有成功，通常不会扣费。你可以简化需求后重试。",

  "dashboard.imageWorkbench.generateSubtitle":
    "用于生成商品主图、海报图与参考图改图。写文案请用「写商品文案」。",
  "dashboard.imageWorkbench.progressTitle": "正在处理你的需求",
  "dashboard.imageWorkbench.progressPatienceVision":
    "请保持页面打开。文字结果通常比图片生成更快。",
  "dashboard.imageWorkbench.progressPatienceImage":
    "图片生成通常需要 20–60 秒，请保持页面打开…",
  "dashboard.imageWorkbench.imageProgressTitle": "正在生成图片",
  "dashboard.imageWorkbench.imageTimeoutFriendly":
    "这次没有成功，通常不会扣费。你可以简化需求后重试。",
  "dashboard.imageWorkbench.imageFailFriendly":
    "这次没有成功，通常不会扣费。你可以简化需求后重试。",
  "dashboard.imageWorkbench.noChargeHint": "本次未成功，通常不会扣除算力积分。",
  "dashboard.imageWorkbench.billingUnknownHint":
    "扣费以用量记录为准。如需排查，可在详情中查看。",
  "dashboard.imageWorkbench.goToCopy": "去写商品文案",
  "dashboard.imageWorkbench.goToGenerate": "用这张图生成 / 改图",
  "dashboard.imageWorkbench.goToGenerateFromCopy": "用这份文案生成图",
  "dashboard.imageWorkbench.simplifyRetry": "简化需求后重试",
  "dashboard.imageWorkbench.copyRequestId": "复制请求编号",
  "dashboard.imageWorkbench.successComplete": "完成",
  "dashboard.imageWorkbench.creditsUsed": "本次消耗：{credits}",

  "dashboard.imageWorkbench.imageStage1": "正在读取图片...",
  "dashboard.imageWorkbench.imageStage2": "正在理解你的需求...",
  "dashboard.imageWorkbench.imageStage3": "正在调用图片模型...",
  "dashboard.imageWorkbench.imageStage4":
    "图片生成通常需要 20–60 秒，请保持页面打开...",
  "dashboard.imageWorkbench.imageStage5": "正在保存结果...",
  "dashboard.imageWorkbench.imageStage6": "即将完成...",
  "dashboard.imageWorkbench.imageStageStillRunning":
    "图片生成仍在进行中，复杂参考图可能需要更久。",
  "dashboard.imageWorkbench.statusQueued": "已排队",
  "dashboard.imageWorkbench.statusValidating": "正在校验请求",
  "dashboard.imageWorkbench.statusBillingCheck": "正在检查算力积分",
  "dashboard.imageWorkbench.statusRequestingModel": "正在发送请求",
  "dashboard.imageWorkbench.statusGenerating": "正在生成图片",
  "dashboard.imageWorkbench.statusSavingResult": "正在保存结果",
  "dashboard.imageWorkbench.statusCompleted": "已完成",
  "dashboard.imageWorkbench.statusFailed": "失败",
  "dashboard.imageWorkbench.progressPercent": "{percent}%",
  "dashboard.imageWorkbench.visionStage1": "正在读取图片...",
  "dashboard.imageWorkbench.visionStage2": "正在理解你的需求...",
  "dashboard.imageWorkbench.visionStage3": "正在分析内容与场景...",
  "dashboard.imageWorkbench.visionStage4": "正在整理结果...",
  "dashboard.imageWorkbench.visionStage5": "即将完成...",
  "dashboard.imageWorkbench.visionStageStillRunning":
    "仍在处理中，复杂分析可能需要更久。",
  "dashboard.imageWorkbench.waitedSeconds": "已等待 {seconds} 秒",

  "dashboard.playground.selectKey": "选择密钥",
  "dashboard.playground.testKeyCreated":
    "测试密钥已创建。请复制完整密钥 — 刷新后将无法再次查看。",
  "dashboard.playground.copySecret": "复制密钥",
  "dashboard.playground.copied": "已复制",
  "dashboard.playground.apiKeyLoadTimedOut":
    "系统正在准备体验密钥，请刷新或稍后重试。",

  "dashboard.imagePlayground.title": "生成 / 改图",
  "dashboard.imagePlayground.toolbenchSubtitle":
    "描述想要的图片，或上传参考图进行改图。",
  "dashboard.imagePlayground.toolbenchInputTitle": "输入",
  "dashboard.imagePlayground.textToImage": "文生图",
  "dashboard.imagePlayground.imageToImage": "参考图改图",
  "dashboard.imagePlayground.waitingForImages": "等待图片准备完成…",
  "dashboard.imagePlayground.inputImagesTitle": "参考图",
  "dashboard.imagePlayground.inputImagesDesc":
    "拖拽、上传或粘贴链接。最多 {max} 张（PNG、JPG、WEBP）。留空则为纯文生图。",
  "dashboard.imagePlayground.inputImagesDragTitle": "拖拽图片到此处或点击上传",
  "dashboard.imagePlayground.inputImagesDragHint": "PNG、JPG、WEBP · 单张最大 10 MB",
  "dashboard.imagePlayground.inputImagesUrlPlaceholder":
    "图片或网页链接——Tokfai 会尽量自动提取图片",
  "dashboard.imagePlayground.addImageUrl": "添加链接",
  "dashboard.imagePlayground.modelComingSoon": "该模型即将上线，暂不可用。",
  "dashboard.imagePlayground.toolbenchApiKeyLabel": "API Key",
  "dashboard.imagePlayground.toolbenchNoKey":
    "如需在自己的应用里调用图片接口，请到 API 密钥页面创建密钥。",
  "dashboard.imagePlayground.createTestKey": "创建测试密钥",
  "dashboard.imagePlayground.createApiKey": "创建 API 密钥",
  "dashboard.imagePlayground.toolbenchPasteKeyShort": "粘贴密钥",
  "dashboard.imagePlayground.toolbenchManageKeysShort": "管理",
  "dashboard.imagePlayground.toolbenchCurrentKeyLine": "当前：{name} · {prefix}…",
  "dashboard.imagePlayground.toolbenchRunSettings": "高级设置",
  "dashboard.imagePlayground.toolbenchBalanceLabel": "算力积分",
  "dashboard.imagePlayground.estimatedCost": "预计消耗：{credits} 算力积分",
  "dashboard.imagePlayground.toolbenchInsufficientCredits":
    "余额不足——请先充值再生成。",
  "dashboard.imagePlayground.topUp": "去充值",
  "dashboard.imagePlayground.toolbenchModelLabel": "模型",
  "dashboard.imagePlayground.size": "尺寸",
  "dashboard.imagePlayground.toolbenchBillingNoteShort":
    "成功生成会扣费，失败通常不扣费。",
  "dashboard.imagePlayground.toolbenchServiceDocs": "服务文档",
  "dashboard.imagePlayground.toolbenchViewImageApiDocs": "图片接口文档",
  "dashboard.imagePlayground.viewUsage": "查看用量",
  "dashboard.imagePlayground.viewCredits": "查看算力积分",
  "dashboard.imagePlayground.toolbenchOpenIntegrationDocs": "接入文档",
  "dashboard.imagePlayground.generating": "生成中…",
  "dashboard.imagePlayground.preparingImages": "准备图片中…",
  "dashboard.imagePlayground.generate": "生成",
  "dashboard.imagePlayground.generateFromReference": "基于参考图改图",
  "dashboard.imagePlayground.referenceImageRequired":
    "请先上传一张参考图。这类需求需要基于原图改图，上传后会尽量保留主体，只修改你指定的部分。",
  "dashboard.imagePlayground.referenceEditResultTitle": "改图结果",
  "dashboard.imagePlayground.subjectDriftHint":
    "如果主体变化明显，可以点击「加强保留主体再试」。",
  "dashboard.imagePlayground.strengthenSubjectRetry": "加强保留主体再试",
  "dashboard.imagePlayground.copyApiRequest": "复制 API 请求",
  "dashboard.imagePlayground.toolbenchResultLoadingTitle": "生成中…",
  "dashboard.imagePlayground.toolbenchResultPanelTitle": "结果",
  "dashboard.imagePlayground.toolbenchResultLoadingHint":
    "请保持此面板可见，结果将显示在这里。",
  "dashboard.imagePlayground.errors.billingNotChargedHint":
    "失败请求通常不会扣费，以用量 / 算力积分记录为准。",
  "dashboard.imagePlayground.toolbenchRetry": "再试一次",
  "dashboard.imagePlayground.toolbenchResultPlaceholder": "生成的图片将显示在这里",
  "dashboard.imagePlayground.base64OnlyHint":
    "结果以图片数据返回，预览可能受限——可重试或查看用量。",
  "dashboard.imagePlayground.successReconcileHint":
    "如需支持排查，可在详情中查看请求编号。",
  "dashboard.imagePlayground.copiedRequestId": "已复制",
  "dashboard.imagePlayground.copyRequestId": "复制请求编号",
  "dashboard.imagePlayground.viewImageApiDocs": "图片接口文档",
  "dashboard.imagePlayground.successCreditsCharged": "本次消耗：{credits}",
  "dashboard.imagePlayground.successComplete": "生成完成",
  "dashboard.imagePlayground.metaModel": "模型",
  "dashboard.imagePlayground.metaCreatedAt": "创建时间",
  "dashboard.imagePlayground.modeText": "文生图",
  "dashboard.imagePlayground.modeReference": "参考图改图",
  "dashboard.imagePlayground.modeTextHint": "描述你想生成的图片。",
  "dashboard.imagePlayground.modeReferenceHint":
    "先上传参考图，再只描述要改的部分。",
  "dashboard.imagePlayground.fastModelEditHint":
    "快速模型更适合草稿。需要保留同一人物时，请优先选择标准 / Pro 模型。",
  "dashboard.imagePlayground.subjectPreserveHonesty":
    "系统会尽量保留参考图主体，但真人换装、换场景仍可能有轻微偏差。",
  "dashboard.imagePlayground.subjectPreserveExpectation":
    "系统会尽量保留参考图主体，但真人换装、换场景仍可能有轻微偏差。",
  "dashboard.imagePlayground.referenceEditResultHint":
    "系统会尽量保留同一主体，但仍可能有轻微差异。",
  "dashboard.imagePlayground.errors.blobUrlBlocked":
    "无法把浏览器本地图片地址发给服务，请重新上传图片文件。",
  "dashboard.imagePlayground.errors.referenceImageUnreadable":
    "参考图没有成功读取，请重新上传图片后再试。",
  "dashboard.imagePlayground.errors.referenceImageMissing":
    "需要上传参考图后才能进行保留主体改图。",
  "dashboard.imagePlayground.errors.modelNotForSubjectPreserve":
    "当前模型更适合生成新图，不适合强保留人物主体。请切换到支持参考图改图的模型。",
  "dashboard.imagePlayground.errors.invalidImageUrl":
    "请输入有效的 http 或 https 链接。",
  "dashboard.imagePlayground.errors.uploadFailed": "上传失败，请重试。",
  "dashboard.imagePlayground.errors.previewFailed": "无法加载图片预览。",
  "dashboard.imagePlayground.errors.previewUrlFailed": "无法从此链接加载图片。",
  "dashboard.imagePlayground.errors.inputUnusable": "这张输入图无法使用。",
  "dashboard.imagePlayground.errors.waitingForImages":
    "请等待输入图上传或解析完成。",
  "dashboard.imagePlayground.preparingShort": "准备中…",
  "dashboard.imagePlayground.resolvingShort": "解析中…",
  "dashboard.imagePlayground.createExperienceKey": "重试",
  "dashboard.imagePlayground.creatingKey": "准备中…",
  "dashboard.imagePlayground.noKeyBody":
    "系统正在准备体验密钥，请刷新或稍后重试。",
  "dashboard.imagePlayground.continueGenerate": "再生成一次",
  "dashboard.imagePlayground.technicalDetails": "详情",
  "dashboard.imagePlayground.presetProduct": "产品图",
  "dashboard.imagePlayground.presetAvatar": "头像图",
  "dashboard.imagePlayground.presetEcommerce": "电商主图",
  "dashboard.imagePlayground.presetPoster": "海报图",
  "dashboard.imagePlayground.presetProductPrompt":
    "生成一张干净的产品风格图片，柔和光线，极简背景。",
  "dashboard.imagePlayground.presetAvatarPrompt":
    "生成一张干净专业的头像肖像，柔和光线，中性背景，高细节。",
  "dashboard.imagePlayground.presetEcommercePrompt":
    "生成一张精致的电商主图，产品在极简棚拍背景上，商业级布光。",
  "dashboard.imagePlayground.presetPosterPrompt":
    "生成一张现代宣传海报，构图醒目，预留清晰排版空间，高级商业风格。",
  "dashboard.imagePlayground.errors.missingToken":
    "系统正在准备体验密钥，请刷新或稍后重试。",
  "dashboard.imagePlayground.errors.invalidToken":
    "系统正在准备体验密钥，请刷新或稍后重试。",
  "dashboard.imagePlayground.errors.invalidOrMissingToken":
    "系统正在准备体验密钥，请刷新或稍后重试。",
  "dashboard.imagePlayground.errors.insufficientCredits":
    "余额不足，请先充值算力积分。",
  "dashboard.imagePlayground.errors.upstreamTimeout":
    "这次没有成功，通常不会扣费。你可以简化需求后重试。",
  "dashboard.imagePlayground.errors.upstreamError":
    "这次没有成功，通常不会扣费。你可以简化需求后重试。",
  "dashboard.imagePlayground.errors.imageGenerationFailed":
    "这次没有成功，通常不会扣费。你可以简化需求后重试。",
  "dashboard.imagePlayground.errors.missingPrompt": "请输入描述。",
  "dashboard.imagePlayground.errors.keyNotRetrievable":
    "系统正在准备体验密钥，请刷新或稍后重试。",
  "dashboard.imagePlayground.errors.unknown":
    "这次没有成功，通常不会扣费。你可以简化需求后重试。",
  "dashboard.imagePlayground.errors.pageImageNotFound":
    "无法从该页面解析可用图片。请换用其他链接或直接上传图片。",
  "dashboard.imagePlayground.errors.tooManyImages": "最多允许 {max} 张输入图。",
  "dashboard.imagePlayground.errors.invalidDrop": "请拖入 PNG、JPG 或 WEBP 图片文件。",
  "dashboard.imagePlayground.errors.modelNotFound": "未找到该模型。",
  "dashboard.imagePlayground.errors.modelNotAvailable": "该模型暂不可用。",
};

/** Exported for parity / UX smoke scripts. */
export const IMAGE_PLAYGROUND_LABEL_TABLES = { en: EN, zh: ZH } as const;

export function readImagePlaygroundLocale(): ImagePlaygroundLocale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "zh" ? "zh" : "en";
}

export function imagePlaygroundLabel(
  key: string,
  locale: ImagePlaygroundLocale = readImagePlaygroundLocale()
): string {
  const table = locale === "zh" ? ZH : EN;
  return table[key] ?? EN[key] ?? key;
}

export function formatImagePlaygroundLabel(
  template: string,
  vars: Record<string, string | number>
): string {
  return Object.entries(vars).reduce(
    (result, [k, value]) => result.replaceAll(`{${k}}`, String(value)),
    template
  );
}
