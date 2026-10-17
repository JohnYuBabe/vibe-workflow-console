/** 接口中对外暴露的用户信息，绝不包含 passwordHash */
export interface UserRef {
  id: string;
  name: string;
}
