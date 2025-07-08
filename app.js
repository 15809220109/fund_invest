//app.js
App({
  onLaunch: function () {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        // 指定云开发环境ID，确保环境一致性
        // env: 'your-env-id', // 请替换为您的实际环境ID
        traceUser: true,
      })
    }

    // 展示本地存储能力
    var logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 仅检查本地存储的用户信息，不进行任何网络请求
    this.checkLocalUserInfo()
  },

  // 检查本地用户信息并自动恢复登录状态
  checkLocalUserInfo: function() {
    // 如果缺少openid和userData，进行静默登录恢复
    if (!this.globalData.openid || !this.globalData.userData) {
      console.log('[App] 开始静默恢复登录状态');
      this.silentLogin();
    }
    
    // 打印当前全局数据状态（调试用）
    console.log('[App] 全局数据状态:', {
      hasOpenid: !!this.globalData.openid,
      hasUserData: !!this.globalData.userData
    });
  },

  // 静默登录 - 恢复登录状态，不显示任何UI提示
  silentLogin: function() {
    wx.cloud.callFunction({
      name: 'login',
      data: {},
      success: res => {
        this.globalData.openid = res.result.openid
        this.globalData.appid = res.result.appid
        this.globalData.unionid = res.result.unionid
        
        console.log('[App] OpenID恢复成功，开始加载用户数据');
        
        // 获取用户数据
        this.loadUserData().then(() => {
          console.log('[App] 静默登录成功，用户状态已恢复');
        }).catch(error => {
          console.warn('[App] 用户数据加载失败，但OpenID已恢复:', error);
        })
      },
      fail: err => {
        console.warn('[App] 静默登录失败:', err);
        // 静默失败，不影响正常使用，用户点击时会重新登录
      }
    })
  },

  // 云开发登录方法（由用户主动触发）
  cloudLogin: function() {
    return new Promise((resolve, reject) => {
      // 获取用户登录状态
      wx.cloud.callFunction({
        name: 'login',
        data: {},
        success: res => {
          this.globalData.openid = res.result.openid
          this.globalData.appid = res.result.appid
          this.globalData.unionid = res.result.unionid
          
          // 获取用户数据并更新登录时间
          this.loadUserData().then(() => {
            // 登录成功后更新最后登录时间
            this.updateUserData({
              lastLoginTime: new Date().toISOString()
            })
            resolve()
          }).catch(reject)
        },
        fail: err => {
          console.error('[用户登录] OpenID获取失败:', err)
          reject(err)
        }
      })
    })
  },

  // 加载用户数据
  loadUserData: function() {
    return new Promise((resolve, reject) => {
      if (!this.globalData.openid) {
        reject(new Error('OpenID not available'))
        return
      }
      
      wx.cloud.callFunction({
        name: 'userDataManager',
        data: {
          action: 'getUserData'
        },
        success: res => {
          if (res.result && res.result.success) {
            if (res.result.exists) {
              // 用户存在，直接使用云端数据
              this.globalData.userData = res.result.data;

              if (this.userDataReadyCallback) {
                this.userDataReadyCallback(res.result.data);
                this.userDataReadyCallback = null;
              }

              resolve(res.result.data)
            } else {
              // 用户不存在，前端初始化后创建
              this.createNewUser().then(resolve).catch(reject);
            }
          } else {
            console.error('[用户登录] 用户数据加载失败:', res.result ? res.result.error : 'Response error');
            reject(new Error(res.result ? res.result.error : 'Response error'))
          }
        },
        fail: err => {
          console.error('[用户登录] userDataManager调用失败:', err);
          reject(err)
        }
      });
    })
  },

  // 创建新用户（前端初始化 + 云端存储）
  createNewUser: function() {
    return new Promise((resolve, reject) => {
      // 引入前端的初始化函数
      const { createNewUserData } = require('./utils/dataStructureUtils.js');
      
      // 前端生成初始数据
      const initialData = createNewUserData();
      
      // 调用云端纯存储接口
      wx.cloud.callFunction({
        name: 'userDataManager',
        data: {
          action: 'createUser',
          data: initialData
        },
        success: res => {
          if (res.result && res.result.success) {
            // 创建成功，保存到全局数据
            this.globalData.userData = res.result.data;

            if (this.userDataReadyCallback) {
              this.userDataReadyCallback(res.result.data);
              this.userDataReadyCallback = null;
            }

            resolve(res.result.data);
          } else {
            console.error('[新用户创建] 失败:', res.result ? res.result.error : 'Unknown error');
            reject(new Error(res.result ? res.result.error : 'User creation failed'));
          }
        },
        fail: err => {
          console.error('[新用户创建] userDataManager调用失败:', err);
          reject(err);
        }
      });
    });
  },

  // 更新用户数据
  updateUserData: function(dataToUpdate) {
    if (!this.globalData.userData || !this.globalData.userData._id) {
      console.error('Cannot update user data: userData or _id missing in globalData.');
      return;
    }
    
    wx.cloud.callFunction({
      name: 'userDataManager',
      data: {
        action: 'updateUserData',
        data: dataToUpdate // Send the specific fields to update
      },
      success: res => {
        if (res.result && res.result.success) {
          // Update successful
        } else {
          console.error('更新用户数据失败 (cloud function):', res.result ? res.result.error : 'Unknown error');
        }
      },
      fail: err => {
        console.error('调用userDataManager updateUserData 失败:', err);
      }
    });
  },

  globalData: {
    openid: null,
    appid: null,
    unionid: null,
    userData: null,
    investmentCountdown: {
      remainingDays: 10,        // 剩余投资天数
      isGameCompleted: false,   // 投资挑战是否完成
      lastUpdateTime: null      // 最后更新时间
    }
  }
})