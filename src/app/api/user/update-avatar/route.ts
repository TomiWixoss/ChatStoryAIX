/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { GoogleDriveService } from "@/services/google-drive.service";
import { AuthService } from "@/services/auth.service";

/**
 * @swagger
 * /api/user/update-avatar:
 *   post:
 *     summary: Cập nhật avatar người dùng
 *     description: Upload và cập nhật ảnh đại diện cho người dùng
 *     tags:
 *       - User Management
 *     security:
 *       - sessionAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *                 description: File ảnh avatar
 *             required:
 *               - avatar
 *     responses:
 *       200:
 *         description: Cập nhật avatar thành công
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Thông báo thành công
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Không tìm thấy file
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Không có quyền truy cập
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Lỗi server
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("avatar") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Không tìm thấy file" },
        { status: 400 }
      );
    }

    const userId = parseInt(session.user.id as string);

    // Convert File thành Buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload file mới lên Google Drive với userId
    const uploadResultPromise = GoogleDriveService.uploadFile(
      buffer,
      file.type,
      userId,
      "avatar", // type
      null // storyId
    );

    // Lấy thông tin user cũ để xóa ảnh cũ nếu có
    const userPromise = AuthService.getUser(userId);

    const [uploadResult, user] = await Promise.all([
      uploadResultPromise,
      userPromise,
    ]);

    if (!uploadResult.fileId || !uploadResult.directLink) {
      throw new Error("Upload failed: Missing file ID or direct link");
    }

    // Check if user exists and has drive_file_id before deleting old file
    if (user && user.drive_file_id) {
      await GoogleDriveService.deleteFile(user.drive_file_id);
    }

    // Cập nhật URL mới trong database
    const result = await AuthService.updateAvatar(
      userId,
      uploadResult.directLink,
      uploadResult.fileId
    );

    // Update session data
    session.user.avatar = uploadResult.directLink;

    return NextResponse.json({
      ...result,
      user: {
        ...session.user,
        avatar: uploadResult.directLink,
      },
    });
  } catch (error: any) {
    console.error("Error in avatar upload:", error);
    return NextResponse.json(
      { error: error.message || "Đã xảy ra lỗi khi xử lý file" },
      { status: 500 }
    );
  }
}
