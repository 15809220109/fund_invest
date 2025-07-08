// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV // 使用当前云环境
})

const db = cloud.database()

// 用户数据类型验证函数
function validateUserDataTypes(data) {
  const errors = []
  
  if (data.currentIndex !== undefined && typeof data.currentIndex !== 'number') {
    errors.push('currentIndex必须是数字类型')
  }
  if (data.initialIndex !== undefined && typeof data.initialIndex !== 'number') {
    errors.push('initialIndex必须是数字类型')
  }
  if (data.totalAmount !== undefined && typeof data.totalAmount !== 'number') {
    errors.push('totalAmount必须是数字类型')
  }
  if (data.totalProfitRate !== undefined && typeof data.totalProfitRate !== 'number') {
    errors.push('totalProfitRate必须是数字类型')
  }
  if (data.cash !== undefined && typeof data.cash !== 'number') {
    errors.push('cash必须是数字类型')
  }
  
  return errors
}

// 安全字段白名单
const ALLOWED_UPDATE_FIELDS = [
  'currentIndex',
  'initialIndex', 
  'totalAmount',
  'totalProfitRate',
  'fundData',
  'lastLoginTime',
  'cash'
]

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action, data } = event

  // 统一请求日志
  console.log(`[${new Date().toISOString()}] 请求: ${action}, OpenID: ${wxContext.OPENID?.substring(0, 8)}...`)

  try {
    switch (action) {
      case 'getUserData':
        return await getUserData(wxContext.OPENID)
      case 'createUser':
        return await createUser(wxContext.OPENID, data)
      case 'updateUserData':
        return await updateUserData(wxContext.OPENID, data)
      case 'updateProfile':
        return await updateProfile(wxContext.OPENID, data)
      default:
        console.error(`未知操作: ${action}`)
        return { success: false, error: '未知操作' }
    }
  } catch (error) {
    console.error(`[${action}] 云函数执行错误:`, error)
    return { 
      success: false, 
      error: error.message
    }
  }
}

// 纯粹的数据获取 - 只负责查询，不产生副作用
async function getUserData(openid) {
  try {
    const result = await db.collection('users').where({
      _openid: openid
    }).get()

    if (result.data.length === 0) {
      return { 
        success: true, 
        exists: false,
        message: '用户不存在，请前端初始化后创建'
      }
    }

    const userData = result.data[0]

    return { 
      success: true, 
      exists: true,
      data: userData
    }
  } catch (error) {
    if (error.errCode === -502005) {
      try {
        await db.createCollection('users')
        return { 
          success: true, 
          exists: false,
          message: '数据库已初始化，用户不存在'
        }
      } catch (createError) {
        console.error('创建users集合失败:', createError)
        throw createError
      }
    } else {
      throw error
    }
  }
}

// 纯粹的用户创建 - 接收前端生成的完整数据
async function createUser(openid, userData) {
  // 基础验证：检查必要字段
  if (!userData || typeof userData !== 'object') {
    return { success: false, error: '用户数据不能为空或格式错误' }
  }

  // 验证关键字段（防止前端传入异常数据）
  if (!userData.hasOwnProperty('currentIndex') || 
      !userData.hasOwnProperty('totalAmount') ||
      !userData.hasOwnProperty('fundData')) {
    return { success: false, error: '缺少必要的用户数据字段' }
  }

  try {
    // 检查用户是否已存在
    const existing = await db.collection('users').where({
      _openid: openid
    }).get()

    if (existing.data.length > 0) {
      return { success: false, error: '用户已存在，无法重复创建' }
    }

    // 纯粹存储前端传入的数据
    const newUser = await db.collection('users').add({
      data: {
        _openid: openid,
        ...userData
      }
    })
    
    return {
      success: true,
      data: {
        _id: newUser._id,
        _openid: openid,
        ...userData
      }
    }
  } catch (error) {
    console.error('创建用户失败:', error)
    return { success: false, error: error.message }
  }
}

// 更新用户数据 - 简化的安全更新接口
async function updateUserData(openid, updateData) {
  // 基础验证
  if (!updateData || typeof updateData !== 'object') {
    return { success: false, error: '更新数据不能为空或格式错误' }
  }

  // 过滤安全字段
  const safeUpdateData = {}
  for (const field of ALLOWED_UPDATE_FIELDS) {
    if (updateData.hasOwnProperty(field)) {
      safeUpdateData[field] = updateData[field]
    }
  }

  // 检查有效字段
  if (Object.keys(safeUpdateData).length === 0) {
    return { success: false, error: '没有有效的更新字段' }
  }

  // 数据类型验证
  const errors = validateUserDataTypes(safeUpdateData)
  if (errors.length > 0) {
    return { success: false, error: errors.join(', ') }
  }

  try {
    const result = await db.collection('users').where({
      _openid: openid
    }).update({
      data: safeUpdateData
    })

    if (result.stats.updated === 0) {
      return { success: false, error: '用户不存在或数据未发生变化' }
    }

    return { success: true, updated: result.stats.updated }
  } catch (error) {
    console.error('更新用户数据失败:', error)
    return { success: false, error: error.message }
  }
}

// 更新用户资料 - 原子更新操作
async function updateProfile(openid, profileData) {
  try {
    // 构建资料更新对象
    const profileUpdate = {}
    
    if (profileData.hasOwnProperty('nickname')) {
      profileUpdate['profile.nickname'] = profileData.nickname
    }
    
    if (profileData.hasOwnProperty('avatar')) {
      profileUpdate['profile.avatar'] = profileData.avatar
    }

    if (Object.keys(profileUpdate).length === 0) {
      return { success: false, error: '没有有效的更新字段' }
    }

    // 使用原子更新操作，只更新传入的字段
    const result = await db.collection('users').where({
      _openid: openid
    }).update({
      data: profileUpdate
    })

    if (result.stats.updated === 0) {
      return { success: false, error: '用户不存在' }
    }

    return { 
      success: true, 
      updated: result.stats.updated
    }
  } catch (error) {
    console.error('更新用户资料失败:', error)
    return { success: false, error: error.message }
  }
}